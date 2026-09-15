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
  ReceiptDiscrepancy,
  StockReceiptStatus,
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
  resolveOwnedLibraryId,
  stockReceiptScopeWhere,
} from '../common/utils/scoped-where';
import { assertCopyTransition } from '../inventory/inventory.math';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStockReceiptDto } from './dto/create-stock-receipt.dto';
import { CreateStockReceiptItemDto } from './dto/create-stock-receipt-item.dto';
import { StockReceiptQueryDto } from './dto/stock-receipt-query.dto';
import { UpdateStockReceiptDto } from './dto/update-stock-receipt.dto';

const RECEIVABLE_STATUSES: DistributionStatus[] = [
  DistributionStatus.DISPATCHED,
  DistributionStatus.PARTIALLY_RECEIVED,
];

const receiptInclude = {
  library: { select: { id: true, name: true, slug: true } },
  actor: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  distribution: {
    select: {
      id: true,
      code: true,
      status: true,
      publisherId: true,
      libraryId: true,
      notes: true,
      dispatchedAt: true,
      publisher: { select: { id: true, name: true, slug: true } },
    },
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
      copy: {
        select: {
          id: true,
          copyNumber: true,
          status: true,
          publisherId: true,
          libraryId: true,
          distributionItemId: true,
        },
      },
    },
  },
} satisfies Prisma.StockReceiptInclude;

type ReceiptRecord = Prisma.StockReceiptGetPayload<{
  include: typeof receiptInclude;
}>;

type LockedCopy = {
  id: string;
  status: CopyStatus;
  editionId: string;
  publisherId: string;
  libraryId: string | null;
  distributionItemId: string | null;
};

type ResolvedLine = {
  copy: LockedCopy;
  received: boolean;
  discrepancy: ReceiptDiscrepancy;
  notes?: string;
};

@Injectable()
export class ReceivingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  async create(
    dto: CreateStockReceiptDto,
    user: AuthUser,
    headerIdempotencyKey?: string,
  ) {
    this.assertLibraryWriter(user);
    const libraryId = resolveOwnedLibraryId(user, dto.libraryId);
    const idempotencyKey = (headerIdempotencyKey ?? dto.idempotencyKey)?.trim();

    if (dto.confirm && !idempotencyKey) {
      throw new BadRequestException('Idempotency-Key is required');
    }

    if (idempotencyKey) {
      const existing = await this.prisma.stockReceipt.findUnique({
        where: {
          libraryId_idempotencyKey: { libraryId, idempotencyKey },
        },
        include: receiptInclude,
      });
      if (existing) {
        return this.serialize(existing);
      }
    }

    if (dto.items) {
      this.assertUniqueLineRefs(dto.items);
    }

    const created = await this.prisma.$transaction(
      async (tx) => {
        const distribution = await this.requireReceivableDistribution(
          tx,
          dto.distributionId,
          libraryId,
          user,
        );
        await this.assertNoOpenDraft(tx, distribution.id);

        const receipt = await tx.stockReceipt.create({
          data: {
            distributionId: distribution.id,
            libraryId,
            status: StockReceiptStatus.DRAFT,
            code: await this.nextCode(tx, libraryId),
            notes: dto.notes,
            actorUserId: user.id,
            idempotencyKey,
          },
          include: receiptInclude,
        });

        if (dto.items && dto.items.length > 0) {
          await this.replaceItems(
            tx,
            receipt.id,
            dto.items,
            distribution,
            libraryId,
          );
        }

        const withItems = await tx.stockReceipt.findUniqueOrThrow({
          where: { id: receipt.id },
          include: receiptInclude,
        });

        if (dto.confirm) {
          return this.confirmInTx(tx, withItems, user, dto.items);
        }
        return withItems;
      },
      { timeout: 60_000, maxWait: 10_000 },
    );

    return this.serialize(created);
  }

  async findAll(query: StockReceiptQueryDto, user: AuthUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildWhere(query, user);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.stockReceipt.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: receiptInclude,
      }),
      this.prisma.stockReceipt.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.serialize(row)),
      meta: paginatedMeta(page, limit, total),
    };
  }

  async getSummary(query: StockReceiptQueryDto, user: AuthUser) {
    const where = this.buildWhere(query, user);
    const [grouped, receivedCopies] = await Promise.all([
      this.prisma.stockReceipt.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      this.prisma.stockReceiptItem.count({
        where: {
          received: true,
          stockReceipt: { ...where, status: StockReceiptStatus.CONFIRMED },
        },
      }),
    ]);

    const countByStatus = {
      draft: 0,
      confirmed: 0,
      cancelled: 0,
    };
    for (const row of grouped) {
      if (row.status === StockReceiptStatus.DRAFT) {
        countByStatus.draft = row._count._all;
      } else if (row.status === StockReceiptStatus.CONFIRMED) {
        countByStatus.confirmed = row._count._all;
      } else if (row.status === StockReceiptStatus.CANCELLED) {
        countByStatus.cancelled = row._count._all;
      }
    }

    return {
      ...countByStatus,
      total:
        countByStatus.draft + countByStatus.confirmed + countByStatus.cancelled,
      copiesReceived: receivedCopies,
    };
  }

  async findOne(id: string, user: AuthUser) {
    const receipt = await this.requireReceipt(id, user);
    return this.serialize(receipt);
  }

  async update(id: string, dto: UpdateStockReceiptDto, user: AuthUser) {
    this.assertLibraryWriter(user);
    const current = await this.requireReceipt(id, user);
    this.assertLibraryAccessTo(current.libraryId, user);
    this.assertDraft(current);

    const updated = await this.prisma.$transaction(async (tx) => {
      const distribution = await this.requireReceivableDistribution(
        tx,
        current.distributionId,
        current.libraryId,
        user,
      );

      if (dto.items) {
        this.assertUniqueLineRefs(dto.items);
        await tx.stockReceiptItem.deleteMany({
          where: { stockReceiptId: current.id },
        });
        await this.replaceItems(
          tx,
          current.id,
          dto.items,
          distribution,
          current.libraryId,
        );
      }

      return tx.stockReceipt.update({
        where: { id: current.id },
        data: { notes: dto.notes },
        include: receiptInclude,
      });
    });

    return this.serialize(updated);
  }

  async confirm(id: string, user: AuthUser, headerIdempotencyKey?: string) {
    this.assertLibraryWriter(user);
    if (!headerIdempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key is required');
    }

    const current = await this.requireReceipt(id, user);
    this.assertLibraryAccessTo(current.libraryId, user);

    if (current.status === StockReceiptStatus.CONFIRMED) {
      return this.serialize(current);
    }
    this.assertDraft(current);

    const confirmed = await this.prisma.$transaction(
      async (tx) => this.confirmInTx(tx, current, user, undefined),
      { timeout: 60_000, maxWait: 10_000 },
    );
    return this.serialize(confirmed);
  }

  async cancel(id: string, user: AuthUser) {
    this.assertLibraryWriter(user);
    const current = await this.requireReceipt(id, user);
    this.assertLibraryAccessTo(current.libraryId, user);
    this.assertDraft(current);

    const cancelled = await this.prisma.$transaction(async (tx) => {
      await tx.stockReceiptItem.deleteMany({
        where: { stockReceiptId: current.id },
      });
      return tx.stockReceipt.update({
        where: { id: current.id },
        data: {
          status: StockReceiptStatus.CANCELLED,
          cancelledAt: new Date(),
        },
        include: receiptInclude,
      });
    });
    return this.serialize(cancelled);
  }

  private async confirmInTx(
    tx: Prisma.TransactionClient,
    receipt: ReceiptRecord,
    user: AuthUser,
    requestedItems: CreateStockReceiptItemDto[] | undefined,
  ) {
    const distribution = await this.requireReceivableDistribution(
      tx,
      receipt.distributionId,
      receipt.libraryId,
      user,
    );

    const lines = await this.resolveConfirmLines(
      tx,
      receipt,
      distribution,
      requestedItems,
    );
    const receivedLines = lines.filter((line) => line.received);
    if (receivedLines.length === 0) {
      throw new BadRequestException('Confirm at least one copy as received');
    }

    if (receipt.items.length === 0 || requestedItems) {
      await tx.stockReceiptItem.deleteMany({
        where: { stockReceiptId: receipt.id },
      });
      await tx.stockReceiptItem.createMany({
        data: lines.map((line) => ({
          stockReceiptId: receipt.id,
          editionId: line.copy.editionId,
          copyId: line.copy.id,
          received: line.received,
          discrepancy: line.discrepancy,
          notes: line.notes,
        })),
      });
    }

    for (const line of receivedLines) {
      assertCopyTransition(line.copy.status, CopyStatus.IN_STOCK_LIBRARY);
      await tx.bookCopy.update({
        where: { id: line.copy.id },
        data: { status: CopyStatus.IN_STOCK_LIBRARY },
      });

      await this.inventory.applyMovement(tx, {
        type: MovementType.RECEIPT,
        editionId: line.copy.editionId,
        quantity: 1,
        copyId: line.copy.id,
        to: this.inventory.libraryHolder(receipt.libraryId),
        toDelta: { inTransit: -1, onHand: 1 },
        actorUserId: user.id,
        reason: receipt.notes ?? `Received copy ${line.copy.id}`,
        refType: 'StockReceipt',
        refId: receipt.id,
      });
    }

    const remaining = await tx.bookCopy.count({
      where: {
        distributionItem: { distributionId: distribution.id },
        status: CopyStatus.DISTRIBUTED,
      },
    });

    await tx.distribution.update({
      where: { id: distribution.id },
      data: {
        status:
          remaining === 0
            ? DistributionStatus.RECEIVED
            : DistributionStatus.PARTIALLY_RECEIVED,
      },
    });

    return tx.stockReceipt.update({
      where: { id: receipt.id },
      data: {
        status: StockReceiptStatus.CONFIRMED,
        confirmedAt: new Date(),
        actorUserId: user.id,
      },
      include: receiptInclude,
    });
  }

  private async resolveConfirmLines(
    tx: Prisma.TransactionClient,
    receipt: ReceiptRecord,
    distribution: { id: string; itemIds: string[] },
    requestedItems: CreateStockReceiptItemDto[] | undefined,
  ): Promise<ResolvedLine[]> {
    if (requestedItems && requestedItems.length > 0) {
      const resolved: ResolvedLine[] = [];
      for (const item of requestedItems) {
        const copy = await this.lockReceivableCopy(tx, {
          libraryId: receipt.libraryId,
          itemIds: distribution.itemIds,
          copyId: item.copyId,
          qrToken: item.qrToken,
        });
        resolved.push({
          copy,
          received: item.received !== false,
          discrepancy: item.discrepancy ?? ReceiptDiscrepancy.NONE,
          notes: item.notes,
        });
      }
      this.assertDiscrepancyRules(resolved);
      return resolved;
    }

    if (receipt.items.length > 0) {
      const resolved: ResolvedLine[] = [];
      for (const item of receipt.items) {
        const copy = await this.lockReceivableCopy(tx, {
          libraryId: receipt.libraryId,
          itemIds: distribution.itemIds,
          copyId: item.copyId,
        });
        resolved.push({
          copy,
          received: item.received,
          discrepancy: item.discrepancy,
          notes: item.notes ?? undefined,
        });
      }
      this.assertDiscrepancyRules(resolved);
      return resolved;
    }

    const remaining = await tx.$queryRaw<LockedCopy[]>(Prisma.sql`
      SELECT
        c.id,
        c.status,
        c."editionId",
        c."publisherId",
        c."libraryId",
        c."distributionItemId"
      FROM "BookCopy" c
      INNER JOIN "DistributionItem" di ON di.id = c."distributionItemId"
      WHERE di."distributionId" = ${distribution.id}
        AND c."libraryId" = ${receipt.libraryId}
        AND c.status = ${CopyStatus.DISTRIBUTED}::"CopyStatus"
      ORDER BY c."copyNumber" ASC
      FOR UPDATE OF c
    `);

    if (remaining.length === 0) {
      throw new BadRequestException(
        'No in-transit copies remain on this shipment',
      );
    }

    return remaining.map((copy) => ({
      copy,
      received: true,
      discrepancy: ReceiptDiscrepancy.NONE,
    }));
  }

  private async replaceItems(
    tx: Prisma.TransactionClient,
    receiptId: string,
    items: CreateStockReceiptItemDto[],
    distribution: { id: string; itemIds: string[] },
    libraryId: string,
  ) {
    const rows: Array<{
      stockReceiptId: string;
      editionId: string;
      copyId: string;
      received: boolean;
      discrepancy: ReceiptDiscrepancy;
      notes?: string;
    }> = [];

    for (const item of items) {
      const copy = await this.lockReceivableCopy(tx, {
        libraryId,
        itemIds: distribution.itemIds,
        copyId: item.copyId,
        qrToken: item.qrToken,
      });
      rows.push({
        stockReceiptId: receiptId,
        editionId: copy.editionId,
        copyId: copy.id,
        received: item.received !== false,
        discrepancy: item.discrepancy ?? ReceiptDiscrepancy.NONE,
        notes: item.notes,
      });
    }

    this.assertDiscrepancyRules(
      rows.map((row) => ({
        copy: { status: CopyStatus.DISTRIBUTED } as LockedCopy,
        received: row.received,
        discrepancy: row.discrepancy,
      })),
    );

    await tx.stockReceiptItem.createMany({ data: rows });
  }

  private async lockReceivableCopy(
    tx: Prisma.TransactionClient,
    input: {
      libraryId: string;
      itemIds: string[];
      copyId?: string;
      qrToken?: string;
    },
  ): Promise<LockedCopy> {
    if (!input.copyId && !input.qrToken) {
      throw new BadRequestException('Each line needs a copyId or qrToken');
    }
    if (input.copyId && input.qrToken) {
      throw new BadRequestException('Provide copyId or qrToken, not both');
    }

    let rows: LockedCopy[];
    if (input.copyId) {
      rows = await tx.$queryRaw<LockedCopy[]>(Prisma.sql`
        SELECT
          c.id,
          c.status,
          c."editionId",
          c."publisherId",
          c."libraryId",
          c."distributionItemId"
        FROM "BookCopy" c
        WHERE c.id = ${input.copyId}
        FOR UPDATE OF c
      `);
    } else {
      rows = await tx.$queryRaw<LockedCopy[]>(Prisma.sql`
        SELECT
          c.id,
          c.status,
          c."editionId",
          c."publisherId",
          c."libraryId",
          c."distributionItemId"
        FROM "QrCode" q
        INNER JOIN "BookCopy" c ON c.id = q."copyId"
        WHERE q.token = ${input.qrToken!}
        FOR UPDATE OF c
      `);
    }

    const copy = rows[0];
    if (!copy) {
      throw new BadRequestException({
        message: 'Copy was not found',
        error: 'INVALID_COPY',
      });
    }
    if (copy.libraryId !== input.libraryId) {
      throw new BadRequestException({
        message: 'Copy does not belong to this library',
        error: 'INVALID_COPY',
      });
    }
    if (
      !copy.distributionItemId ||
      !input.itemIds.includes(copy.distributionItemId)
    ) {
      throw new BadRequestException({
        message: 'Copy is not on this shipment',
        error: 'INVALID_COPY',
      });
    }
    if (copy.status !== CopyStatus.DISTRIBUTED) {
      throw new BadRequestException({
        message: `Copy is ${copy.status} and cannot be received`,
        error: 'INVALID_COPY',
      });
    }
    return copy;
  }

  private async requireReceivableDistribution(
    db: PrismaService | Prisma.TransactionClient,
    distributionId: string,
    libraryId: string,
    user: AuthUser,
  ) {
    const distribution = await db.distribution.findUnique({
      where: { id: distributionId },
      include: {
        items: { select: { id: true } },
      },
    });
    if (!distribution) {
      throw new NotFoundException(`Distribution ${distributionId} not found`);
    }
    if (distribution.libraryId !== libraryId) {
      throw new ForbiddenException('Cannot receive another library shipment');
    }
    this.assertCanReadDistribution(distribution, user);
    if (!RECEIVABLE_STATUSES.includes(distribution.status)) {
      throw new ConflictException(
        `Distribution ${distribution.id} is ${distribution.status} and cannot be received`,
      );
    }
    return {
      id: distribution.id,
      libraryId: distribution.libraryId,
      publisherId: distribution.publisherId,
      status: distribution.status,
      itemIds: distribution.items.map((item) => item.id),
    };
  }

  private async assertNoOpenDraft(
    tx: Prisma.TransactionClient,
    distributionId: string,
  ) {
    const open = await tx.stockReceipt.findFirst({
      where: {
        distributionId,
        status: StockReceiptStatus.DRAFT,
      },
      select: { id: true },
    });
    if (open) {
      throw new ConflictException(
        `A draft receipt already exists for this shipment (${open.id})`,
      );
    }
  }

  private buildWhere(
    query: StockReceiptQueryDto,
    user: AuthUser,
  ): Prisma.StockReceiptWhereInput {
    if (query.publisherId) {
      assertPublisherAccess(user, query.publisherId);
    }
    if (query.libraryId) {
      assertLibraryAccess(user, query.libraryId);
    }

    const where: Prisma.StockReceiptWhereInput = {
      ...stockReceiptScopeWhere(user),
    };

    if (query.publisherId) {
      where.distribution = { publisherId: query.publisherId };
    }
    if (query.libraryId) {
      where.libraryId = query.libraryId;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.distributionId) {
      where.distributionId = query.distributionId;
    }
    if (query.editionId) {
      where.items = { some: { editionId: query.editionId } };
    }
    if (query.search) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { notes: { contains: query.search, mode: 'insensitive' } },
        {
          distribution: {
            code: { contains: query.search, mode: 'insensitive' },
          },
        },
      ];
    }

    return where;
  }

  private async requireReceipt(id: string, user: AuthUser) {
    const receipt = await this.prisma.stockReceipt.findUnique({
      where: { id },
      include: receiptInclude,
    });
    if (!receipt) {
      throw new NotFoundException(`Stock receipt ${id} not found`);
    }
    this.assertCanRead(receipt, user);
    return receipt;
  }

  private async nextCode(
    tx: Prisma.TransactionClient,
    libraryId: string,
  ): Promise<string> {
    const now = new Date();
    const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
    const prefix = `R-${stamp}-`;
    const latest = await tx.stockReceipt.findFirst({
      where: {
        libraryId,
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

  private assertUniqueLineRefs(items: CreateStockReceiptItemDto[]) {
    const seen = new Set<string>();
    for (const item of items) {
      const key = item.copyId
        ? `copy:${item.copyId}`
        : item.qrToken
          ? `qr:${item.qrToken}`
          : null;
      if (!key) {
        throw new BadRequestException('Each line needs a copyId or qrToken');
      }
      if (seen.has(key)) {
        throw new BadRequestException(
          'Each copy may appear only once per receipt',
        );
      }
      seen.add(key);
    }
  }

  private assertDiscrepancyRules(
    lines: Array<{ received: boolean; discrepancy: ReceiptDiscrepancy }>,
  ) {
    for (const line of lines) {
      if (!line.received && line.discrepancy === ReceiptDiscrepancy.NONE) {
        throw new BadRequestException(
          'Unreceived copies must be flagged MISSING or DAMAGED',
        );
      }
    }
  }

  private assertDraft(receipt: { status: StockReceiptStatus; id: string }) {
    if (receipt.status !== StockReceiptStatus.DRAFT) {
      throw new ConflictException(
        `Stock receipt ${receipt.id} is ${receipt.status} and cannot be changed`,
      );
    }
  }

  private assertLibraryWriter(user: AuthUser) {
    if (isSuperAdmin(user.role) || isLibraryRole(user.role)) {
      return;
    }
    throw new ForbiddenException('Only library staff can receive stock');
  }

  private assertLibraryAccessTo(libraryId: string, user: AuthUser) {
    assertLibraryAccess(user, libraryId);
  }

  private assertCanRead(
    receipt: { libraryId: string; distribution: { publisherId: string } },
    user: AuthUser,
  ) {
    if (isSuperAdmin(user.role)) {
      return;
    }
    if (isPublisherRole(user.role)) {
      assertPublisherAccess(user, receipt.distribution.publisherId);
      return;
    }
    if (isLibraryRole(user.role)) {
      assertLibraryAccess(user, receipt.libraryId);
      return;
    }
    throw new ForbiddenException('Cannot access this stock receipt');
  }

  private assertCanReadDistribution(
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

  private serialize(receipt: ReceiptRecord) {
    const receivedCount = receipt.items.filter((item) => item.received).length;
    const discrepancyCount = receipt.items.filter(
      (item) => item.discrepancy !== ReceiptDiscrepancy.NONE,
    ).length;
    return {
      id: receipt.id,
      distributionId: receipt.distributionId,
      libraryId: receipt.libraryId,
      status: receipt.status,
      code: receipt.code,
      notes: receipt.notes,
      actorUserId: receipt.actorUserId,
      confirmedAt: receipt.confirmedAt,
      cancelledAt: receipt.cancelledAt,
      idempotencyKey: receipt.idempotencyKey,
      createdAt: receipt.createdAt,
      updatedAt: receipt.updatedAt,
      itemCount: receipt.items.length,
      receivedCount,
      discrepancyCount,
      library: receipt.library,
      actor: receipt.actor,
      distribution: receipt.distribution,
      items: receipt.items.map((item) => ({
        id: item.id,
        editionId: item.editionId,
        copyId: item.copyId,
        received: item.received,
        discrepancy: item.discrepancy,
        notes: item.notes,
        createdAt: item.createdAt,
        edition: item.edition,
        copy: item.copy,
      })),
    };
  }
}
