import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CopyStatus,
  Prisma,
  SyncTransactionStatus,
  SyncTransactionType,
} from '../../generated/prisma/client';
import {
  AuthUser,
  isLibraryRole,
  isSuperAdmin,
} from '../common/types/auth-user';
import { resolveOwnedLibraryId } from '../common/utils/scoped-where';
import {
  conflictCodeFromException,
  messageFromException,
} from '../common/utils/conflict-code';
import { PrismaService } from '../prisma/prisma.service';
import { ReceivingService } from '../receiving/receiving.service';
import { CreateStockReceiptDto } from '../receiving/dto/create-stock-receipt.dto';
import { SalesService } from '../sales/sales.service';
import { CreateSaleDto } from '../sales/dto/create-sale.dto';
import { SyncBatchDto, SyncItemDto } from './dto/sync-batch.dto';

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sales: SalesService,
    private readonly receiving: ReceivingService,
  ) {}

  async processBatch(dto: SyncBatchDto, user: AuthUser) {
    if (!isSuperAdmin(user.role) && !isLibraryRole(user.role)) {
      throw new BadRequestException('Only library staff can sync transactions');
    }

    const results: Array<Awaited<ReturnType<typeof this.processOne>>> = [];
    for (const item of dto.transactions) {
      results.push(await this.processOne(item, user));
    }
    return { results };
  }

  private async processOne(item: SyncItemDto, user: AuthUser) {
    const payload = item.payload ?? {};
    const libraryId = resolveOwnedLibraryId(
      user,
      typeof payload.libraryId === 'string' ? payload.libraryId : undefined,
    );

    const existing = await this.prisma.syncTransaction.findUnique({
      where: {
        libraryId_clientId: { libraryId, clientId: item.clientId },
      },
    });
    if (existing?.status === SyncTransactionStatus.APPLIED) {
      return {
        clientId: item.clientId,
        status: 'DUPLICATE',
        reason: 'DUPLICATE',
        entity: existing.result,
      };
    }

    const row =
      existing ??
      (await this.prisma.syncTransaction.create({
        data: {
          clientId: item.clientId,
          libraryId,
          actorUserId: user.id,
          type: item.type,
          status: SyncTransactionStatus.PENDING,
          payload: payload as Prisma.InputJsonValue,
        },
      }));

    try {
      await this.assertFreshSnapshot(item, libraryId);
      const entity = await this.apply(item, user, libraryId);
      const updated = await this.prisma.syncTransaction.update({
        where: { id: row.id },
        data: {
          status: SyncTransactionStatus.APPLIED,
          result: entity as Prisma.InputJsonValue,
          rejectReason: null,
          appliedAt: new Date(),
        },
      });
      return {
        clientId: item.clientId,
        status: updated.status,
        entity,
      };
    } catch (error) {
      const reason = conflictCodeFromException(error);
      const message = messageFromException(error);
      await this.prisma.syncTransaction.update({
        where: { id: row.id },
        data: {
          status: SyncTransactionStatus.REJECTED,
          rejectReason: reason,
          result: { message } as Prisma.InputJsonValue,
        },
      });
      return {
        clientId: item.clientId,
        status: 'REJECTED',
        reason,
        message,
      };
    }
  }

  private async apply(item: SyncItemDto, user: AuthUser, libraryId: string) {
    if (item.type === SyncTransactionType.SALE) {
      const dto = this.asSaleDto(item.payload, libraryId, item.clientId);
      return this.sales.create(dto, user, item.clientId);
    }
    if (item.type === SyncTransactionType.STOCK_RECEIPT) {
      const dto = this.asReceiptDto(item.payload, libraryId, item.clientId);
      return this.receiving.create(dto, user, item.clientId);
    }
    throw new BadRequestException('Unsupported sync type');
  }

  private asSaleDto(
    payload: Record<string, unknown>,
    libraryId: string,
    clientId: string,
  ): CreateSaleDto {
    const items = Array.isArray(payload.items) ? payload.items : [];
    return {
      libraryId,
      notes: typeof payload.notes === 'string' ? payload.notes : undefined,
      idempotencyKey: clientId,
      items: items as CreateSaleDto['items'],
    };
  }

  private asReceiptDto(
    payload: Record<string, unknown>,
    libraryId: string,
    clientId: string,
  ): CreateStockReceiptDto {
    const distributionId =
      typeof payload.distributionId === 'string'
        ? payload.distributionId
        : undefined;
    if (!distributionId) {
      throw new BadRequestException({
        message: 'distributionId is required',
        error: 'INVALID_COPY',
      });
    }
    return {
      libraryId,
      distributionId,
      notes: typeof payload.notes === 'string' ? payload.notes : undefined,
      confirm: payload.confirm !== false,
      idempotencyKey: clientId,
      items: Array.isArray(payload.items)
        ? (payload.items as CreateStockReceiptDto['items'])
        : undefined,
    };
  }

  private async assertFreshSnapshot(item: SyncItemDto, libraryId: string) {
    const payload = item.payload;
    const copyId =
      typeof payload.copyId === 'string'
        ? payload.copyId
        : typeof payload.items === 'object' &&
            Array.isArray(payload.items) &&
            payload.items[0] &&
            typeof payload.items[0] === 'object' &&
            payload.items[0] !== null &&
            'copyId' in payload.items[0]
          ? String((payload.items[0] as { copyId?: string }).copyId ?? '')
          : '';
    const expectedStatus =
      typeof payload.expectedCopyStatus === 'string'
        ? payload.expectedCopyStatus
        : CopyStatus.IN_STOCK_LIBRARY;

    if (!copyId || item.type !== SyncTransactionType.SALE) {
      return;
    }

    const copy = await this.prisma.bookCopy.findUnique({
      where: { id: copyId },
      select: { status: true, libraryId: true, updatedAt: true },
    });
    if (!copy || copy.libraryId !== libraryId) {
      throw new BadRequestException({
        message: 'Copy was not found',
        error: 'INVALID_COPY',
      });
    }
    if (
      item.copyUpdatedAt &&
      copy.updatedAt.getTime() > new Date(item.copyUpdatedAt).getTime() &&
      copy.status !== expectedStatus &&
      copy.status !== CopyStatus.SOLD
    ) {
      throw new BadRequestException({
        message: 'Local copy snapshot is stale',
        error: 'STALE_DATA',
      });
    }
  }
}
