import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  CopyStatus,
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
  resolveOwnedLibraryId,
  saleScopeWhere,
} from '../common/utils/scoped-where';
import { assertCopyTransition } from '../inventory/inventory.math';
import { InventoryService } from '../inventory/inventory.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { CreateSaleItemDto } from './dto/create-sale-item.dto';
import { SaleQueryDto } from './dto/sale-query.dto';

const saleInclude = {
  library: { select: { id: true, name: true, slug: true } },
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
          listPriceCents: true,
          currency: true,
          book: {
            select: {
              id: true,
              title: true,
              authors: true,
              slug: true,
              publisherId: true,
            },
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
        },
      },
    },
  },
} satisfies Prisma.SaleInclude;

type SaleRecord = Prisma.SaleGetPayload<{
  include: typeof saleInclude;
}>;

type LockedCopy = {
  id: string;
  status: CopyStatus;
  editionId: string;
  publisherId: string;
  libraryId: string | null;
  listPriceCents: number;
  currency: string;
};

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  async create(
    dto: CreateSaleDto,
    user: AuthUser,
    headerIdempotencyKey?: string,
  ) {
    this.assertLibraryWriter(user);
    const libraryId = resolveOwnedLibraryId(user, dto.libraryId);
    const idempotencyKey = (headerIdempotencyKey ?? dto.idempotencyKey)?.trim();
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key is required');
    }

    const existing = await this.prisma.sale.findUnique({
      where: {
        libraryId_idempotencyKey: { libraryId, idempotencyKey },
      },
      include: saleInclude,
    });
    if (existing) {
      return this.serialize(existing);
    }

    this.assertUniqueLineRefs(dto.items);

    const created = await this.prisma.$transaction(
      async (tx) => {
        await this.assertSellableLibrary(tx, libraryId);

        const resolved: Array<{
          copy: LockedCopy;
          unitPriceCents: number;
        }> = [];
        const allocated = new Set<string>();

        for (const item of dto.items) {
          const copies = await this.lockSellableCopies(tx, {
            libraryId,
            copyId: item.copyId,
            qrToken: item.qrToken,
            quantity: item.quantity ?? 1,
            excludeIds: allocated,
          });
          for (const copy of copies) {
            if (allocated.has(copy.id)) {
              throw new BadRequestException(
                'Each copy may appear only once per sale',
              );
            }
            allocated.add(copy.id);
            resolved.push({
              copy,
              unitPriceCents: item.unitPriceCents ?? copy.listPriceCents,
            });
          }
        }

        const currency = resolved[0]?.copy.currency ?? 'USD';
        const totalCents = resolved.reduce(
          (sum, row) => sum + row.unitPriceCents,
          0,
        );

        const sale = await tx.sale.create({
          data: {
            libraryId,
            code: await this.nextCode(tx, libraryId),
            currency,
            totalCents,
            notes: dto.notes,
            actorUserId: user.id,
            soldAt: new Date(),
            idempotencyKey,
            items: {
              create: resolved.map((row) => ({
                editionId: row.copy.editionId,
                copyId: row.copy.id,
                unitPriceCents: row.unitPriceCents,
                quantity: 1,
              })),
            },
          },
          include: saleInclude,
        });

        for (const row of resolved) {
          assertCopyTransition(row.copy.status, CopyStatus.SOLD);
          await tx.bookCopy.update({
            where: { id: row.copy.id },
            data: { status: CopyStatus.SOLD },
          });

          await this.inventory.applyMovement(tx, {
            type: MovementType.SALE,
            editionId: row.copy.editionId,
            quantity: 1,
            copyId: row.copy.id,
            from: this.inventory.libraryHolder(libraryId),
            fromDelta: { onHand: -1, sold: 1 },
            actorUserId: user.id,
            reason: dto.notes ?? `Sold copy ${row.copy.id}`,
            refType: 'Sale',
            refId: sale.id,
          });
        }

        return sale;
      },
      { timeout: 60_000, maxWait: 10_000 },
    );

    await this.notifications?.onSaleCreated(created).catch((error: unknown) => {
      this.logger.error(
        `Sale ${created.id} committed but notification enqueue failed`,
        error instanceof Error ? error.stack : String(error),
      );
    });
    return this.serialize(created);
  }

  async findAll(query: SaleQueryDto, user: AuthUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildWhere(query, user);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.sale.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { soldAt: 'desc' },
        include: saleInclude,
      }),
      this.prisma.sale.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.serialize(row)),
      meta: paginatedMeta(page, limit, total),
    };
  }

  async getSummary(query: SaleQueryDto, user: AuthUser) {
    const where = this.buildWhere(query, user);
    const [count, aggregates, itemCount] = await Promise.all([
      this.prisma.sale.count({ where }),
      this.prisma.sale.aggregate({
        where,
        _sum: { totalCents: true },
      }),
      this.prisma.saleItem.count({
        where: { sale: where },
      }),
    ]);

    return {
      saleCount: count,
      itemCount,
      totalCents: aggregates._sum.totalCents ?? 0,
    };
  }

  async findOne(id: string, user: AuthUser) {
    const sale = await this.requireSale(id, user);
    return this.serialize(sale);
  }

  private buildWhere(
    query: SaleQueryDto,
    user: AuthUser,
  ): Prisma.SaleWhereInput {
    if (query.libraryId) {
      assertLibraryAccess(user, query.libraryId);
    }
    if (query.publisherId) {
      assertPublisherAccess(user, query.publisherId);
    }

    const where: Prisma.SaleWhereInput = {
      ...saleScopeWhere(user),
    };

    if (query.libraryId) {
      where.libraryId = query.libraryId;
    }

    const itemFilters: Prisma.SaleItemWhereInput[] = [];
    if (query.publisherId) {
      itemFilters.push({
        edition: { book: { publisherId: query.publisherId } },
      });
    }
    if (query.editionId) {
      itemFilters.push({ editionId: query.editionId });
    }
    if (query.copyId) {
      itemFilters.push({ copyId: query.copyId });
    }
    if (itemFilters.length === 1) {
      where.items = { some: itemFilters[0] };
    } else if (itemFilters.length > 1) {
      where.AND = itemFilters.map((filter) => ({
        items: { some: filter },
      }));
    }

    if (query.search) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { notes: { contains: query.search, mode: 'insensitive' } },
        {
          library: { name: { contains: query.search, mode: 'insensitive' } },
        },
        {
          items: {
            some: {
              edition: {
                OR: [
                  { isbn: { contains: query.search, mode: 'insensitive' } },
                  {
                    book: {
                      title: { contains: query.search, mode: 'insensitive' },
                    },
                  },
                  {
                    book: {
                      authors: {
                        contains: query.search,
                        mode: 'insensitive',
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      ];
    }

    return where;
  }

  private async requireSale(id: string, user: AuthUser) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: saleInclude,
    });
    if (!sale) {
      throw new NotFoundException(`Sale ${id} not found`);
    }
    this.assertCanRead(sale, user);
    return sale;
  }

  private async assertSellableLibrary(
    db: PrismaService | Prisma.TransactionClient,
    libraryId: string,
  ) {
    const library = await db.library.findUnique({
      where: { id: libraryId },
      select: { id: true, isActive: true },
    });
    if (!library) {
      throw new NotFoundException(`Library ${libraryId} not found`);
    }
    if (!library.isActive) {
      throw new BadRequestException('Cannot sell from an inactive library');
    }
  }

  private async lockSellableCopy(
    tx: Prisma.TransactionClient,
    input: { libraryId: string; copyId?: string; qrToken?: string },
  ): Promise<LockedCopy> {
    if (!input.copyId && !input.qrToken) {
      throw new BadRequestException('Each line needs a copyId or qrToken');
    }
    if (input.copyId && input.qrToken) {
      throw new BadRequestException('Provide copyId or qrToken, not both');
    }

    type LockedRow = {
      id: string;
      status: CopyStatus;
      editionId: string;
      publisherId: string;
      libraryId: string | null;
      listPriceCents: number;
      currency: string;
    };

    let rows: LockedRow[];

    if (input.copyId) {
      rows = await tx.$queryRaw<LockedRow[]>(Prisma.sql`
        SELECT
          c.id,
          c.status,
          c."editionId",
          c."publisherId",
          c."libraryId",
          e."listPriceCents",
          e.currency
        FROM "BookCopy" c
        INNER JOIN "Edition" e ON e.id = c."editionId"
        WHERE c.id = ${input.copyId}
        FOR UPDATE OF c
      `);
    } else {
      rows = await tx.$queryRaw<LockedRow[]>(Prisma.sql`
        SELECT
          c.id,
          c.status,
          c."editionId",
          c."publisherId",
          c."libraryId",
          e."listPriceCents",
          e.currency
        FROM "QrCode" q
        INNER JOIN "BookCopy" c ON c.id = q."copyId"
        INNER JOIN "Edition" e ON e.id = c."editionId"
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

    if (copy.status === CopyStatus.SOLD) {
      throw new BadRequestException({
        message: 'Copy has already been sold',
        error: 'ALREADY_SOLD',
      });
    }

    if (copy.status !== CopyStatus.IN_STOCK_LIBRARY) {
      throw new BadRequestException({
        message: `Copy is ${copy.status} and cannot be sold`,
        error: 'INVALID_COPY',
      });
    }

    return copy;
  }

  /**
   * Lock the scanned copy plus enough other in-stock copies of the same
   * edition at this library to satisfy `quantity`.
   */
  private async lockSellableCopies(
    tx: Prisma.TransactionClient,
    input: {
      libraryId: string;
      copyId?: string;
      qrToken?: string;
      quantity: number;
      excludeIds: Set<string>;
    },
  ): Promise<LockedCopy[]> {
    const quantity = input.quantity;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      throw new BadRequestException('Quantity must be a whole number from 1 to 100');
    }

    const primary = await this.lockSellableCopy(tx, input);
    if (quantity === 1) {
      return [primary];
    }

    const needed = quantity - 1;
    const excluded = Prisma.join([primary.id, ...input.excludeIds]);
    const extras = await tx.$queryRaw<LockedCopy[]>(Prisma.sql`
      SELECT
        c.id,
        c.status,
        c."editionId",
        c."publisherId",
        c."libraryId",
        e."listPriceCents",
        e.currency
      FROM "BookCopy" c
      INNER JOIN "Edition" e ON e.id = c."editionId"
      WHERE c."editionId" = ${primary.editionId}
        AND c."libraryId" = ${input.libraryId}
        AND c.status = ${CopyStatus.IN_STOCK_LIBRARY}::"CopyStatus"
        AND c.id NOT IN (${excluded})
      ORDER BY c."copyNumber" ASC
      LIMIT ${needed}
      FOR UPDATE OF c
    `);

    if (extras.length < needed) {
      throw new BadRequestException({
        message: `Only ${extras.length + 1} copies of this title are in library stock`,
        error: 'INSUFFICIENT_STOCK',
      });
    }

    return [primary, ...extras];
  }

  private assertUniqueLineRefs(items: CreateSaleItemDto[]) {
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
          'Each copy may appear only once per sale',
        );
      }
      seen.add(key);
    }
  }

  private async nextCode(
    tx: Prisma.TransactionClient,
    libraryId: string,
  ): Promise<string> {
    const now = new Date();
    const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
    const prefix = `S-${stamp}-`;
    const latest = await tx.sale.findFirst({
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

  private assertLibraryWriter(user: AuthUser) {
    if (isSuperAdmin(user.role) || isLibraryRole(user.role)) {
      return;
    }
    throw new ForbiddenException('Only library staff can record sales');
  }

  private assertCanRead(sale: SaleRecord, user: AuthUser) {
    if (isSuperAdmin(user.role)) {
      return;
    }
    if (isLibraryRole(user.role)) {
      assertLibraryAccess(user, sale.libraryId);
      return;
    }
    if (isPublisherRole(user.role) && user.publisherId) {
      const ownsItem = sale.items.some(
        (item) => item.edition.book.publisherId === user.publisherId,
      );
      if (!ownsItem) {
        throw new ForbiddenException('Cannot access this sale');
      }
      return;
    }
    throw new ForbiddenException('Cannot access this sale');
  }

  private serialize(sale: SaleRecord) {
    return {
      id: sale.id,
      libraryId: sale.libraryId,
      code: sale.code,
      currency: sale.currency,
      totalCents: sale.totalCents,
      notes: sale.notes,
      actorUserId: sale.actorUserId,
      soldAt: sale.soldAt,
      idempotencyKey: sale.idempotencyKey,
      createdAt: sale.createdAt,
      updatedAt: sale.updatedAt,
      itemCount: sale.items.length,
      library: sale.library,
      actor: sale.actor,
      items: sale.items.map((item) => ({
        id: item.id,
        saleId: item.saleId,
        editionId: item.editionId,
        copyId: item.copyId,
        unitPriceCents: item.unitPriceCents,
        quantity: item.quantity,
        createdAt: item.createdAt,
        edition: item.edition,
        copy: item.copy,
      })),
    };
  }
}
