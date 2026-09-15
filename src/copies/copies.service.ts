import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  CopyBatchStatus,
  CopyStatus,
  InventoryHolderType,
  MovementType,
  Prisma,
} from '../../generated/prisma/client';
import { paginatedMeta } from '../common/dto/pagination.dto';
import {
  AuthUser,
  isLibraryRole,
  isPublisherRole,
  isSuperAdmin,
} from '../common/types/auth-user';
import {
  assertLibraryAccess,
  assertPublisherAccess,
  copyScopeWhere,
} from '../common/utils/scoped-where';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { BulkCreateCopiesDto } from './dto/bulk-create-copies.dto';
import { CopyQueryDto } from './dto/copy-query.dto';
import { QrService } from './qr.service';

const COPY_CHUNK = 100;

const copyInclude = {
  qrCode: { select: { token: true } },
  edition: {
    select: {
      id: true,
      isbn: true,
      format: true,
      title: true,
      listPriceCents: true,
      currency: true,
      coverImageUrl: true,
      book: {
        select: {
          id: true,
          title: true,
          authors: true,
          publisherId: true,
          slug: true,
          coverImageUrl: true,
        },
      },
    },
  },
  library: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.BookCopyInclude;

@Injectable()
export class CopiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly qr: QrService,
  ) {}

  async bulkCreate(
    dto: BulkCreateCopiesDto,
    user: AuthUser,
    headerIdempotencyKey?: string,
  ) {
    this.assertPublisherWriter(user);
    const idempotencyKey = headerIdempotencyKey ?? dto.idempotencyKey;
    const edition = await this.requireEditionForPublisher(dto.editionId, user);
    const publisherId = edition.book.publisherId;

    if (idempotencyKey) {
      const existing = await this.prisma.copyGenerationBatch.findUnique({
        where: {
          publisherId_idempotencyKey: { publisherId, idempotencyKey },
        },
      });
      if (existing) {
        return this.batchResponse(existing);
      }
    }

    const batch = await this.prisma.$transaction(
      async (tx) => {
        const created = await tx.copyGenerationBatch.create({
          data: {
            publisherId,
            editionId: edition.id,
            requestedQuantity: dto.quantity,
            status: CopyBatchStatus.PROCESSING,
            actorUserId: user.id,
            idempotencyKey,
          },
        });

        const reserved = await tx.edition.update({
          where: { id: edition.id },
          data: { nextCopyNumber: { increment: dto.quantity } },
          select: { nextCopyNumber: true },
        });
        const startNumber = reserved.nextCopyNumber - dto.quantity;

        for (let offset = 0; offset < dto.quantity; offset += COPY_CHUNK) {
          const size = Math.min(COPY_CHUNK, dto.quantity - offset);
          const copies = Array.from({ length: size }, (_, index) => {
            const copyNumber = startNumber + offset + index;
            return {
              id: randomUUID(),
              editionId: edition.id,
              publisherId,
              status: CopyStatus.IN_STOCK_PUBLISHER,
              copyNumber,
            };
          });
          const qrCodes = copies.map((copy) => ({
            id: randomUUID(),
            copyId: copy.id,
            token: this.qr.createToken(),
          }));
          await tx.bookCopy.createMany({ data: copies });
          await tx.qrCode.createMany({ data: qrCodes });
        }

        await this.inventory.applyMovement(tx, {
          type: MovementType.PRINT_RECEIPT,
          editionId: edition.id,
          quantity: dto.quantity,
          to: this.inventory.publisherWarehouse(publisherId),
          toDelta: { onHand: dto.quantity },
          actorUserId: user.id,
          reason: dto.reason ?? `Printed ${dto.quantity} copies`,
          refType: 'CopyGenerationBatch',
          refId: created.id,
        });

        return tx.copyGenerationBatch.update({
          where: { id: created.id },
          data: {
            status: CopyBatchStatus.COMPLETED,
            createdQuantity: dto.quantity,
          },
        });
      },
      { timeout: 60_000, maxWait: 10_000 },
    );

    return this.batchResponse(batch);
  }

  async findAll(query: CopyQueryDto, user: AuthUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.BookCopyWhereInput = {
      ...copyScopeWhere(user),
      ...this.buildWhere(query, user),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.bookCopy.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ editionId: 'asc' }, { copyNumber: 'asc' }],
        include: copyInclude,
      }),
      this.prisma.bookCopy.count({ where }),
    ]);

    return {
      data: data.map((copy) => this.serialize(copy)),
      meta: paginatedMeta(page, limit, total),
    };
  }

  async findOne(id: string, user: AuthUser, includeQrImage = false) {
    const copy = await this.prisma.bookCopy.findUnique({
      where: { id },
      include: copyInclude,
    });
    if (!copy) {
      throw new NotFoundException(`Copy ${id} not found`);
    }
    this.assertCopyAccess(user, copy);
    return this.serialize(copy, includeQrImage);
  }

  async findByQrToken(token: string, user: AuthUser, includeQrImage = false) {
    const qrCode = await this.prisma.qrCode.findUnique({
      where: { token },
      include: { copy: { include: copyInclude } },
    });
    if (!qrCode) {
      throw new NotFoundException('Copy not found for this QR token');
    }
    this.assertCopyAccess(user, qrCode.copy);
    return this.serialize(qrCode.copy, includeQrImage);
  }

  private buildWhere(
    query: CopyQueryDto,
    user: AuthUser,
  ): Prisma.BookCopyWhereInput {
    const where: Prisma.BookCopyWhereInput = {};
    if (query.editionId) {
      where.editionId = query.editionId;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.copyNumber) {
      where.copyNumber = query.copyNumber;
    }
    if (query.libraryId) {
      assertLibraryAccess(user, query.libraryId);
      where.libraryId = query.libraryId;
    }
    return where;
  }

  private async requireEditionForPublisher(editionId: string, user: AuthUser) {
    const edition = await this.prisma.edition.findUnique({
      where: { id: editionId },
      select: {
        id: true,
        book: { select: { publisherId: true } },
      },
    });
    if (!edition) {
      throw new NotFoundException(`Edition ${editionId} not found`);
    }
    assertPublisherAccess(user, edition.book.publisherId);
    return edition;
  }

  private assertPublisherWriter(user: AuthUser) {
    if (isSuperAdmin(user.role) || isPublisherRole(user.role)) {
      return;
    }
    throw new ForbiddenException('Only publisher staff can generate copies');
  }

  private assertCopyAccess(
    user: AuthUser,
    copy: { publisherId: string; libraryId: string | null },
  ) {
    if (isSuperAdmin(user.role)) {
      return;
    }
    if (isPublisherRole(user.role)) {
      assertPublisherAccess(user, copy.publisherId);
      return;
    }
    if (isLibraryRole(user.role)) {
      if (!copy.libraryId || copy.libraryId !== user.libraryId) {
        throw new NotFoundException('Copy not found for this QR token');
      }
      return;
    }
    throw new ForbiddenException('Cannot access this copy');
  }

  private batchResponse(batch: {
    id: string;
    editionId: string;
    publisherId: string;
    requestedQuantity: number;
    createdQuantity: number;
    status: CopyBatchStatus;
    idempotencyKey: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: batch.id,
      editionId: batch.editionId,
      publisherId: batch.publisherId,
      requestedQuantity: batch.requestedQuantity,
      createdQuantity: batch.createdQuantity,
      status: batch.status,
      idempotencyKey: batch.idempotencyKey,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
      holderType: InventoryHolderType.PUBLISHER,
    };
  }

  private async serialize(
    copy: Prisma.BookCopyGetPayload<{ include: typeof copyInclude }>,
    includeQrImage = false,
  ) {
    const token = copy.qrCode?.token ?? null;
    return {
      id: copy.id,
      editionId: copy.editionId,
      publisherId: copy.publisherId,
      libraryId: copy.libraryId,
      status: copy.status,
      copyNumber: copy.copyNumber,
      createdAt: copy.createdAt,
      updatedAt: copy.updatedAt,
      qrToken: token,
      qrImageDataUrl:
        includeQrImage && token ? await this.qr.toDataUrl(token) : null,
      edition: copy.edition,
      library: copy.library,
    };
  }
}
