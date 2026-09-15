import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CopyStatus,
  DistributionStatus,
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
  assertPublisherLibraryLink,
  distributionScopeWhere,
  resolveOwnedPublisherId,
} from '../common/utils/scoped-where';
import { assertCopyTransition } from '../inventory/inventory.math';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDistributionDto } from './dto/create-distribution.dto';
import { CreateDistributionItemDto } from './dto/create-distribution-item.dto';
import { DistributionQueryDto } from './dto/distribution-query.dto';
import { UpdateDistributionDto } from './dto/update-distribution.dto';

const distributionInclude = {
  library: { select: { id: true, name: true, slug: true } },
  publisher: { select: { id: true, name: true, slug: true } },
  actor: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      edition: {
        select: {
          id: true,
          isbn: true,
          format: true,
          title: true,
          book: {
            select: { id: true, title: true, authors: true, slug: true },
          },
        },
      },
      copies: {
        select: { id: true, copyNumber: true, status: true },
        orderBy: { copyNumber: 'asc' as const },
      },
    },
  },
} satisfies Prisma.DistributionInclude;

type DistributionRecord = Prisma.DistributionGetPayload<{
  include: typeof distributionInclude;
}>;

@Injectable()
export class DistributionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  async create(
    dto: CreateDistributionDto,
    user: AuthUser,
    headerIdempotencyKey?: string,
  ) {
    this.assertPublisherWriter(user);
    const publisherId = resolveOwnedPublisherId(user, dto.publisherId);
    const idempotencyKey =
      (headerIdempotencyKey ?? dto.idempotencyKey)?.trim() || undefined;
    this.assertUniqueEditionLines(dto.items);

    if (idempotencyKey) {
      const existing = await this.prisma.distribution.findUnique({
        where: {
          publisherId_idempotencyKey: { publisherId, idempotencyKey },
        },
        include: distributionInclude,
      });
      if (existing) {
        return this.serialize(existing);
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      await this.assertAllocatableLibrary(tx, publisherId, dto.libraryId, user);
      await this.assertEditionsForPublisher(
        tx,
        publisherId,
        dto.items.map((item) => item.editionId),
        user,
      );

      const distribution = await tx.distribution.create({
        data: {
          publisherId,
          libraryId: dto.libraryId,
          status: DistributionStatus.DRAFT,
          code: await this.nextCode(tx, publisherId),
          notes: dto.notes,
          actorUserId: user.id,
          idempotencyKey,
          items: {
            create: dto.items.map((item) => ({
              editionId: item.editionId,
              quantity: item.quantity,
            })),
          },
        },
        include: distributionInclude,
      });

      if (dto.dispatch) {
        return this.dispatchInTx(tx, distribution, dto.items, user);
      }
      return distribution;
    });

    return this.serialize(created);
  }

  async findAll(query: DistributionQueryDto, user: AuthUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildWhere(query, user);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.distribution.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: distributionInclude,
      }),
      this.prisma.distribution.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.serialize(row)),
      meta: paginatedMeta(page, limit, total),
    };
  }

  async getSummary(query: DistributionQueryDto, user: AuthUser) {
    const where = this.buildWhere(query, user);
    const [grouped, copiesInTransit] = await Promise.all([
      this.prisma.distribution.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      this.prisma.bookCopy.count({
        where: {
          status: CopyStatus.DISTRIBUTED,
          ...(isLibraryRole(user.role) && user.libraryId
            ? { libraryId: user.libraryId }
            : isPublisherRole(user.role) && user.publisherId
              ? { publisherId: user.publisherId }
              : {}),
        },
      }),
    ]);

    const countByStatus = {
      draft: 0,
      dispatched: 0,
      partiallyReceived: 0,
      received: 0,
      cancelled: 0,
    };
    for (const row of grouped) {
      if (row.status === DistributionStatus.DRAFT) {
        countByStatus.draft = row._count._all;
      } else if (row.status === DistributionStatus.DISPATCHED) {
        countByStatus.dispatched = row._count._all;
      } else if (row.status === DistributionStatus.PARTIALLY_RECEIVED) {
        countByStatus.partiallyReceived = row._count._all;
      } else if (row.status === DistributionStatus.RECEIVED) {
        countByStatus.received = row._count._all;
      } else if (row.status === DistributionStatus.CANCELLED) {
        countByStatus.cancelled = row._count._all;
      }
    }

    return {
      ...countByStatus,
      total:
        countByStatus.draft +
        countByStatus.dispatched +
        countByStatus.partiallyReceived +
        countByStatus.received +
        countByStatus.cancelled,
      copiesInTransit,
    };
  }

  async findOne(id: string, user: AuthUser) {
    const distribution = await this.requireDistribution(id, user);
    return this.serialize(distribution);
  }

  async update(id: string, dto: UpdateDistributionDto, user: AuthUser) {
    this.assertPublisherWriter(user);
    const current = await this.requireDistribution(id, user);
    this.assertPublisherAccessTo(current.publisherId, user);
    this.assertDraft(current);

    if (dto.items) {
      this.assertUniqueEditionLines(dto.items);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const libraryId = dto.libraryId ?? current.libraryId;
      if (libraryId !== current.libraryId) {
        await this.assertAllocatableLibrary(
          tx,
          current.publisherId,
          libraryId,
          user,
        );
      }
      if (dto.items) {
        await this.assertEditionsForPublisher(
          tx,
          current.publisherId,
          dto.items.map((item) => item.editionId),
          user,
        );
        await tx.distributionItem.deleteMany({
          where: { distributionId: current.id },
        });
      }

      return tx.distribution.update({
        where: { id: current.id },
        data: {
          libraryId,
          notes: dto.notes,
          ...(dto.items
            ? {
                items: {
                  create: dto.items.map((item) => ({
                    editionId: item.editionId,
                    quantity: item.quantity,
                  })),
                },
              }
            : {}),
        },
        include: distributionInclude,
      });
    });

    return this.serialize(updated);
  }

  async dispatch(id: string, user: AuthUser) {
    this.assertPublisherWriter(user);
    const current = await this.requireDistribution(id, user);
    this.assertPublisherAccessTo(current.publisherId, user);
    this.assertDraft(current);

    const dispatched = await this.prisma.$transaction(
      async (tx) => this.dispatchInTx(tx, current, undefined, user),
      { timeout: 60_000, maxWait: 10_000 },
    );
    return this.serialize(dispatched);
  }

  async cancel(id: string, user: AuthUser) {
    this.assertPublisherWriter(user);
    const current = await this.requireDistribution(id, user);
    this.assertPublisherAccessTo(current.publisherId, user);
    this.assertDraft(current);

    const cancelled = await this.prisma.distribution.update({
      where: { id: current.id },
      data: {
        status: DistributionStatus.CANCELLED,
        cancelledAt: new Date(),
      },
      include: distributionInclude,
    });
    return this.serialize(cancelled);
  }

  private async dispatchInTx(
    tx: Prisma.TransactionClient,
    distribution: DistributionRecord,
    requestedItems: CreateDistributionItemDto[] | undefined,
    user: AuthUser,
  ) {
    await this.assertAllocatableLibrary(
      tx,
      distribution.publisherId,
      distribution.libraryId,
      user,
    );

    const copyIdsByEdition = new Map<string, string[] | undefined>();
    if (requestedItems) {
      for (const item of requestedItems) {
        copyIdsByEdition.set(item.editionId, item.copyIds);
      }
    }

    for (const item of distribution.items) {
      const copies = await this.pickCopies(tx, {
        publisherId: distribution.publisherId,
        editionId: item.editionId,
        quantity: item.quantity,
        copyIds: copyIdsByEdition.get(item.editionId),
      });

      for (const copy of copies) {
        assertCopyTransition(copy.status, CopyStatus.DISTRIBUTED);
        await tx.bookCopy.update({
          where: { id: copy.id },
          data: {
            status: CopyStatus.DISTRIBUTED,
            libraryId: distribution.libraryId,
            distributionItemId: item.id,
          },
        });
      }

      await this.inventory.applyMovement(tx, {
        type: MovementType.DISTRIBUTION,
        editionId: item.editionId,
        quantity: item.quantity,
        from: this.inventory.publisherWarehouse(distribution.publisherId),
        fromDelta: { onHand: -item.quantity },
        to: this.inventory.libraryHolder(distribution.libraryId),
        toDelta: { inTransit: item.quantity },
        actorUserId: user.id,
        reason:
          distribution.notes ?? `Dispatched ${item.quantity} copies to library`,
        refType: 'Distribution',
        refId: distribution.id,
      });
    }

    return tx.distribution.update({
      where: { id: distribution.id },
      data: {
        status: DistributionStatus.DISPATCHED,
        dispatchedAt: new Date(),
        actorUserId: user.id,
      },
      include: distributionInclude,
    });
  }

  private async pickCopies(
    tx: Prisma.TransactionClient,
    input: {
      publisherId: string;
      editionId: string;
      quantity: number;
      copyIds?: string[];
    },
  ) {
    if (input.copyIds && input.copyIds.length > 0) {
      if (input.copyIds.length !== input.quantity) {
        throw new BadRequestException(
          'copyIds length must match the line quantity',
        );
      }
      const unique = new Set(input.copyIds);
      if (unique.size !== input.copyIds.length) {
        throw new BadRequestException('copyIds must be unique');
      }
      const copies = await tx.bookCopy.findMany({
        where: { id: { in: input.copyIds } },
        select: {
          id: true,
          status: true,
          editionId: true,
          publisherId: true,
          libraryId: true,
          distributionItemId: true,
        },
      });
      if (copies.length !== input.copyIds.length) {
        throw new BadRequestException('One or more copies were not found');
      }
      for (const copy of copies) {
        if (
          copy.editionId !== input.editionId ||
          copy.publisherId !== input.publisherId ||
          copy.status !== CopyStatus.IN_STOCK_PUBLISHER ||
          copy.libraryId !== null ||
          copy.distributionItemId !== null
        ) {
          throw new BadRequestException(
            `Copy ${copy.id} is not available in the publisher warehouse`,
          );
        }
      }
      return copies;
    }

    const copies = await tx.$queryRaw<
      Array<{
        id: string;
        status: CopyStatus;
        editionId: string;
        publisherId: string;
        libraryId: string | null;
        distributionItemId: string | null;
      }>
    >(Prisma.sql`
      SELECT id, status, "editionId", "publisherId", "libraryId", "distributionItemId"
      FROM "BookCopy"
      WHERE "editionId" = ${input.editionId}
        AND "publisherId" = ${input.publisherId}
        AND status = ${CopyStatus.IN_STOCK_PUBLISHER}::"CopyStatus"
        AND "libraryId" IS NULL
        AND "distributionItemId" IS NULL
      ORDER BY "copyNumber" ASC
      LIMIT ${input.quantity}
      FOR UPDATE SKIP LOCKED
    `);

    if (copies.length < input.quantity) {
      throw new BadRequestException({
        message: `Insufficient warehouse copies for this edition (need ${input.quantity}, found ${copies.length})`,
        error: 'INSUFFICIENT_INVENTORY',
      });
    }

    return copies;
  }

  private buildWhere(
    query: DistributionQueryDto,
    user: AuthUser,
  ): Prisma.DistributionWhereInput {
    if (query.publisherId) {
      assertPublisherAccess(user, query.publisherId);
    }
    if (query.libraryId) {
      assertLibraryAccess(user, query.libraryId);
    }

    const where: Prisma.DistributionWhereInput = {
      ...distributionScopeWhere(user),
    };

    if (query.publisherId) {
      where.publisherId = query.publisherId;
    }
    if (query.libraryId) {
      where.libraryId = query.libraryId;
    }
    if (query.status) {
      where.status = query.status;
    } else if (query.receivable) {
      where.status = {
        in: [
          DistributionStatus.DISPATCHED,
          DistributionStatus.PARTIALLY_RECEIVED,
        ],
      };
    }
    if (query.editionId) {
      where.items = { some: { editionId: query.editionId } };
    }
    if (query.search) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { notes: { contains: query.search, mode: 'insensitive' } },
        { library: { name: { contains: query.search, mode: 'insensitive' } } },
        { library: { slug: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    return where;
  }

  private async requireDistribution(id: string, user: AuthUser) {
    const distribution = await this.prisma.distribution.findUnique({
      where: { id },
      include: distributionInclude,
    });
    if (!distribution) {
      throw new NotFoundException(`Distribution ${id} not found`);
    }
    this.assertCanRead(distribution, user);
    return distribution;
  }

  private async assertAllocatableLibrary(
    db: PrismaService | Prisma.TransactionClient,
    publisherId: string,
    libraryId: string,
    user: AuthUser,
  ) {
    const library = await db.library.findUnique({
      where: { id: libraryId },
      select: { id: true, isActive: true },
    });
    if (!library) {
      throw new NotFoundException(`Library ${libraryId} not found`);
    }
    if (!library.isActive) {
      throw new BadRequestException('Cannot distribute to an inactive library');
    }

    const link = await db.publisherLibrary.findUnique({
      where: { publisherId_libraryId: { publisherId, libraryId } },
    });
    assertPublisherLibraryLink(user, link, libraryId);
    if (!link || !link.isActive) {
      throw new BadRequestException('Library partnership is missing or paused');
    }
  }

  private async assertEditionsForPublisher(
    db: PrismaService | Prisma.TransactionClient,
    publisherId: string,
    editionIds: string[],
    user: AuthUser,
  ) {
    const editions = await db.edition.findMany({
      where: { id: { in: editionIds } },
      select: {
        id: true,
        isActive: true,
        book: { select: { publisherId: true } },
      },
    });
    if (editions.length !== editionIds.length) {
      throw new NotFoundException('One or more editions were not found');
    }
    for (const edition of editions) {
      assertPublisherAccess(user, edition.book.publisherId);
      if (edition.book.publisherId !== publisherId) {
        throw new ForbiddenException(
          'Cannot distribute an edition from another publisher',
        );
      }
      if (!edition.isActive) {
        throw new BadRequestException(
          `Edition ${edition.id} is inactive and cannot be distributed`,
        );
      }
    }
  }

  private async nextCode(
    tx: Prisma.TransactionClient,
    publisherId: string,
  ): Promise<string> {
    const now = new Date();
    const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
    const prefix = `D-${stamp}-`;
    const latest = await tx.distribution.findFirst({
      where: {
        publisherId,
        code: { startsWith: prefix },
      },
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const next = latest ? Number(latest.code.slice(prefix.length)) + 1 : 1;
    if (!Number.isFinite(next) || next < 1) {
      return `${prefix}${Date.now().toString(36).slice(-4).toUpperCase()}`;
    }
    return `${prefix}${String(next).padStart(3, '0')}`;
  }

  private assertUniqueEditionLines(items: CreateDistributionItemDto[]) {
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.editionId)) {
        throw new BadRequestException(
          'Each edition may appear only once per shipment',
        );
      }
      seen.add(item.editionId);
    }
  }

  private assertDraft(distribution: {
    status: DistributionStatus;
    id: string;
  }) {
    if (distribution.status !== DistributionStatus.DRAFT) {
      throw new ConflictException(
        `Distribution ${distribution.id} is ${distribution.status} and cannot be changed`,
      );
    }
  }

  private assertPublisherWriter(user: AuthUser) {
    if (isSuperAdmin(user.role) || isPublisherRole(user.role)) {
      return;
    }
    throw new ForbiddenException(
      'Only publisher staff can allocate or dispatch stock',
    );
  }

  private assertPublisherAccessTo(publisherId: string, user: AuthUser) {
    assertPublisherAccess(user, publisherId);
  }

  private assertCanRead(
    distribution: { publisherId: string; libraryId: string },
    user: AuthUser,
  ) {
    if (isSuperAdmin(user.role)) {
      return;
    }
    if (isPublisherRole(user.role)) {
      assertPublisherAccess(user, distribution.publisherId);
      return;
    }
    if (isLibraryRole(user.role)) {
      assertLibraryAccess(user, distribution.libraryId);
      return;
    }
    throw new ForbiddenException('Cannot access this distribution');
  }

  private serialize(distribution: DistributionRecord) {
    const totalQuantity = distribution.items.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );
    return {
      id: distribution.id,
      publisherId: distribution.publisherId,
      libraryId: distribution.libraryId,
      status: distribution.status,
      code: distribution.code,
      notes: distribution.notes,
      actorUserId: distribution.actorUserId,
      dispatchedAt: distribution.dispatchedAt,
      cancelledAt: distribution.cancelledAt,
      idempotencyKey: distribution.idempotencyKey,
      createdAt: distribution.createdAt,
      updatedAt: distribution.updatedAt,
      totalQuantity,
      itemCount: distribution.items.length,
      publisher: distribution.publisher,
      library: distribution.library,
      actor: distribution.actor,
      items: distribution.items.map((item) => ({
        id: item.id,
        editionId: item.editionId,
        quantity: item.quantity,
        createdAt: item.createdAt,
        edition: item.edition,
        copies: item.copies,
      })),
    };
  }
}
