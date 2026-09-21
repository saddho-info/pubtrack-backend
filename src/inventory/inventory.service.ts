import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
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
  editionScopeWhere,
  inventoryScopeWhere,
  movementScopeWhere,
} from '../common/utils/scoped-where';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryQueryDto } from './dto/inventory-query.dto';
import { MovementQueryDto } from './dto/movement-query.dto';
import { UpdateThresholdDto } from './dto/update-threshold.dto';
import {
  applyInventoryDelta,
  assertCopyTransition,
  assertNonNegativeCounts,
  EMPTY_INVENTORY_COUNTS,
  isLowStock,
  type InventoryCounts,
  type InventoryDelta,
} from './inventory.math';

export type InventoryTx = Prisma.TransactionClient;

export type InventoryHolder = {
  holderType: InventoryHolderType;
  holderId: string;
};

export type ApplyMovementInput = {
  type: MovementType;
  editionId: string;
  quantity: number;
  copyId?: string;
  from?: InventoryHolder;
  to?: InventoryHolder;
  fromDelta?: InventoryDelta;
  toDelta?: InventoryDelta;
  actorUserId: string;
  reason?: string;
  refType?: string;
  refId?: string;
};

const editionCatalogInclude = {
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
} satisfies Prisma.EditionInclude;

const movementInclude = {
  edition: {
    select: {
      id: true,
      isbn: true,
      format: true,
      title: true,
      book: { select: { id: true, title: true, authors: true } },
    },
  },
  copy: { select: { id: true, copyNumber: true, status: true } },
  actor: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
} satisfies Prisma.InventoryMovementInclude;

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Append a ledger row and increment holder aggregates in the same transaction.
   * Callers (copies, distribution, sales, receiving) must already be inside `tx`.
   */
  async applyMovement(
    tx: InventoryTx,
    input: ApplyMovementInput,
  ): Promise<{ movementId: string }> {
    if (input.quantity < 1) {
      throw new BadRequestException('Movement quantity must be at least 1');
    }

    if (input.copyId) {
      const copy = await tx.bookCopy.findUnique({
        where: { id: input.copyId },
        select: { id: true, editionId: true },
      });
      if (!copy || copy.editionId !== input.editionId) {
        throw new BadRequestException('copyId does not belong to this edition');
      }
    }

    if (input.from && input.fromDelta) {
      await this.incrementHolder(
        tx,
        input.editionId,
        input.from,
        input.fromDelta,
      );
    }
    if (input.to && input.toDelta) {
      await this.incrementHolder(tx, input.editionId, input.to, input.toDelta);
    }

    const movement = await tx.inventoryMovement.create({
      data: {
        type: input.type,
        editionId: input.editionId,
        copyId: input.copyId,
        quantity: input.quantity,
        fromHolderType: input.from?.holderType,
        fromHolderId: input.from?.holderId,
        toHolderType: input.to?.holderType,
        toHolderId: input.to?.holderId,
        actorUserId: input.actorUserId,
        reason: input.reason,
        refType: input.refType,
        refId: input.refId,
      },
      select: { id: true },
    });

    return { movementId: movement.id };
  }

  async transitionCopy(
    tx: InventoryTx,
    copyId: string,
    nextStatus: CopyStatus,
    libraryId?: string | null,
  ) {
    const copy = await tx.bookCopy.findUnique({
      where: { id: copyId },
      select: { id: true, status: true },
    });
    if (!copy) {
      throw new NotFoundException(`Copy ${copyId} not found`);
    }
    assertCopyTransition(copy.status, nextStatus);
    return tx.bookCopy.update({
      where: { id: copyId },
      data: {
        status: nextStatus,
        libraryId: libraryId === undefined ? undefined : libraryId,
      },
    });
  }

  async findAll(query: InventoryQueryDto, user: AuthUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildEditionWhere(query, user);

    if (query.lowStock) {
      const lowStockIds = await this.lowStockEditionIds(user);
      where.id = query.editionId
        ? query.editionId
        : { in: lowStockIds.length > 0 ? lowStockIds : ['__none__'] };
    }

    const [editions, total] = await this.prisma.$transaction([
      this.prisma.edition.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ book: { title: 'asc' } }, { createdAt: 'desc' }],
        include: {
          ...editionCatalogInclude,
          inventory: { where: inventoryScopeWhere(user) },
          _count: { select: { copies: true } },
        },
      }),
      this.prisma.edition.count({ where }),
    ]);

    return {
      data: editions.map((edition) => this.toRollup(edition)),
      meta: paginatedMeta(page, limit, total),
    };
  }

  async findLowStock(query: InventoryQueryDto, user: AuthUser) {
    return this.findAll(
      { ...query, lowStock: true, limit: query.limit ?? 50 },
      user,
    );
  }

  async getSummary(user: AuthUser, query: InventoryQueryDto) {
    this.assertOptionalOrgFilters(user, query);
    const where: Prisma.InventoryWhereInput = {
      ...inventoryScopeWhere(user),
      ...(query.editionId ? { editionId: query.editionId } : {}),
      ...(query.holderType ? { holderType: query.holderType } : {}),
    };
    if (query.publisherId) {
      where.edition = { book: { publisherId: query.publisherId } };
    }
    if (query.libraryId) {
      where.AND = [
        ...(Array.isArray(where.AND)
          ? where.AND
          : where.AND
            ? [where.AND]
            : []),
        {
          holderType: InventoryHolderType.LIBRARY,
          holderId: query.libraryId,
        },
      ];
    }

    const rows = await this.prisma.inventory.findMany({
      where,
      select: {
        holderType: true,
        onHand: true,
        inTransit: true,
        sold: true,
        returned: true,
        lost: true,
        lowStockThreshold: true,
      },
    });

    const warehouse = rows.filter(
      (row) => row.holderType === InventoryHolderType.PUBLISHER,
    );
    const libraries = rows.filter(
      (row) => row.holderType === InventoryHolderType.LIBRARY,
    );

    const warehouseOnHand = warehouse.reduce((sum, row) => sum + row.onHand, 0);
    const libraryOnHand = libraries.reduce((sum, row) => sum + row.onHand, 0);
    const inTransit = rows.reduce((sum, row) => sum + row.inTransit, 0);
    const sold = rows.reduce((sum, row) => sum + row.sold, 0);
    const returned = rows.reduce((sum, row) => sum + row.returned, 0);
    const lost = rows.reduce((sum, row) => sum + row.lost, 0);
    // Library users hold no warehouse rows, so count against the shelves they
    // actually own. Mirrors the branching in lowStockEditionIds.
    const lowStockRows =
      isLibraryRole(user.role) && user.libraryId ? libraries : warehouse;
    const lowStockCount = lowStockRows.filter((row) =>
      isLowStock(row.onHand, row.lowStockThreshold),
    ).length;

    return {
      warehouseOnHand,
      libraryOnHand,
      inTransit,
      sold,
      returned,
      lost,
      totalOnHand: warehouseOnHand + libraryOnHand,
      lowStockCount,
    };
  }

  async findMovements(query: MovementQueryDto, user: AuthUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.InventoryMovementWhereInput = {
      ...movementScopeWhere(user),
      ...(query.editionId ? { editionId: query.editionId } : {}),
      ...(query.copyId ? { copyId: query.copyId } : {}),
      ...(query.type ? { type: query.type } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.inventoryMovement.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: movementInclude,
      }),
      this.prisma.inventoryMovement.count({ where }),
    ]);

    return { data, meta: paginatedMeta(page, limit, total) };
  }

  async updateThreshold(dto: UpdateThresholdDto, user: AuthUser) {
    const edition = await this.prisma.edition.findUnique({
      where: { id: dto.editionId },
      select: {
        id: true,
        book: { select: { publisherId: true } },
      },
    });
    if (!edition) {
      throw new NotFoundException(`Edition ${dto.editionId} not found`);
    }

    const holder = this.resolveWritableHolder(user, edition.book.publisherId);

    return this.prisma.inventory.upsert({
      where: {
        editionId_holderType_holderId: {
          editionId: edition.id,
          holderType: holder.holderType,
          holderId: holder.holderId,
        },
      },
      create: {
        editionId: edition.id,
        holderType: holder.holderType,
        holderId: holder.holderId,
        lowStockThreshold: dto.lowStockThreshold,
      },
      update: { lowStockThreshold: dto.lowStockThreshold },
    });
  }

  publisherWarehouse(publisherId: string): InventoryHolder {
    return { holderType: InventoryHolderType.PUBLISHER, holderId: publisherId };
  }

  libraryHolder(libraryId: string): InventoryHolder {
    return { holderType: InventoryHolderType.LIBRARY, holderId: libraryId };
  }

  private async incrementHolder(
    tx: InventoryTx,
    editionId: string,
    holder: InventoryHolder,
    delta: InventoryDelta,
  ) {
    const existing = await tx.inventory.findUnique({
      where: {
        editionId_holderType_holderId: {
          editionId,
          holderType: holder.holderType,
          holderId: holder.holderId,
        },
      },
    });

    if (!existing) {
      const createdCounts = applyInventoryDelta(EMPTY_INVENTORY_COUNTS, delta);
      assertNonNegativeCounts(createdCounts);
      try {
        await tx.inventory.create({
          data: {
            editionId,
            holderType: holder.holderType,
            holderId: holder.holderId,
            ...createdCounts,
            version: 1,
          },
        });
        return;
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2002'
        ) {
          throw error;
        }
      }
    }

    const current = existing ?? {
      ...EMPTY_INVENTORY_COUNTS,
    };
    const next = applyInventoryDelta(current, delta);
    assertNonNegativeCounts(next);

    await tx.inventory.update({
      where: {
        editionId_holderType_holderId: {
          editionId,
          holderType: holder.holderType,
          holderId: holder.holderId,
        },
      },
      data: {
        onHand: { increment: delta.onHand ?? 0 },
        inTransit: { increment: delta.inTransit ?? 0 },
        sold: { increment: delta.sold ?? 0 },
        returned: { increment: delta.returned ?? 0 },
        lost: { increment: delta.lost ?? 0 },
        version: { increment: 1 },
      },
    });
  }

  private async lowStockEditionIds(user: AuthUser): Promise<string[]> {
    const preferWarehouse =
      isSuperAdmin(user.role) || isPublisherRole(user.role);

    type Row = { editionId: string };

    if (isLibraryRole(user.role) && user.libraryId) {
      const rows = await this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT DISTINCT "editionId"
        FROM "Inventory"
        WHERE "holderType" = 'LIBRARY'::"InventoryHolderType"
          AND "holderId" = ${user.libraryId}
          AND "onHand" <= "lowStockThreshold"
      `);
      return rows.map((row) => row.editionId);
    }

    if (preferWarehouse && isPublisherRole(user.role) && user.publisherId) {
      const rows = await this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT DISTINCT i."editionId"
        FROM "Inventory" i
        INNER JOIN "Edition" e ON e.id = i."editionId"
        INNER JOIN "Book" b ON b.id = e."bookId"
        WHERE b."publisherId" = ${user.publisherId}
          AND i."holderType" = 'PUBLISHER'::"InventoryHolderType"
          AND i."onHand" <= i."lowStockThreshold"
      `);
      return rows.map((row) => row.editionId);
    }

    if (preferWarehouse && isSuperAdmin(user.role)) {
      const rows = await this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT DISTINCT "editionId"
        FROM "Inventory"
        WHERE "holderType" = 'PUBLISHER'::"InventoryHolderType"
          AND "onHand" <= "lowStockThreshold"
      `);
      return rows.map((row) => row.editionId);
    }

    return [];
  }

  private buildEditionWhere(
    query: InventoryQueryDto,
    user: AuthUser,
  ): Prisma.EditionWhereInput {
    this.assertOptionalOrgFilters(user, query);

    // Library users are scoped by their inventory holdings below. Book-level
    // scoping excludes them from every publisher's catalog, so applying both
    // yields an unsatisfiable filter.
    const scopedByHoldings = isLibraryRole(user.role) && Boolean(user.libraryId);

    const where: Prisma.EditionWhereInput = scopedByHoldings
      ? {}
      : { ...editionScopeWhere(user) };

    if (query.editionId) {
      where.id = query.editionId;
    }
    if (query.publisherId) {
      where.book = { publisherId: query.publisherId };
    }
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }
    if (query.search) {
      where.OR = [
        { isbn: { contains: query.search } },
        { title: { contains: query.search, mode: 'insensitive' } },
        { book: { title: { contains: query.search, mode: 'insensitive' } } },
        { book: { authors: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    if (isLibraryRole(user.role) && user.libraryId) {
      where.inventory = {
        some: {
          holderType: InventoryHolderType.LIBRARY,
          holderId: user.libraryId,
        },
      };
    }
    if (query.libraryId) {
      where.inventory = {
        some: {
          holderType: InventoryHolderType.LIBRARY,
          holderId: query.libraryId,
        },
      };
    }

    return where;
  }

  private toRollup(
    edition: Prisma.EditionGetPayload<{
      include: {
        book: {
          select: {
            id: true;
            title: true;
            authors: true;
            publisherId: true;
            slug: true;
            coverImageUrl: true;
          };
        };
        inventory: true;
        _count: { select: { copies: true } };
      };
    }>,
  ) {
    const warehouse = edition.inventory.find(
      (row) => row.holderType === InventoryHolderType.PUBLISHER,
    );
    const libraryRows = edition.inventory.filter(
      (row) => row.holderType === InventoryHolderType.LIBRARY,
    );
    const warehouseOnHand = warehouse?.onHand ?? 0;
    const libraryOnHand = libraryRows.reduce((sum, row) => sum + row.onHand, 0);
    const inTransit = edition.inventory.reduce(
      (sum, row) => sum + row.inTransit,
      0,
    );
    const sold = edition.inventory.reduce((sum, row) => sum + row.sold, 0);
    const returned = edition.inventory.reduce(
      (sum, row) => sum + row.returned,
      0,
    );
    const lost = edition.inventory.reduce((sum, row) => sum + row.lost, 0);
    const alertRow = warehouse ?? libraryRows[0];
    const threshold = alertRow?.lowStockThreshold ?? 5;
    const counts: InventoryCounts = {
      onHand: warehouseOnHand + libraryOnHand,
      inTransit,
      sold,
      returned,
      lost,
    };

    return {
      editionId: edition.id,
      isbn: edition.isbn,
      isbn10: edition.isbn10,
      format: edition.format,
      editionTitle: edition.title,
      listPriceCents: edition.listPriceCents,
      currency: edition.currency,
      isActive: edition.isActive,
      book: edition.book,
      warehouseOnHand,
      libraryOnHand,
      inTransit,
      sold,
      returned,
      lost,
      totalOnHand: counts.onHand,
      lowStockThreshold: threshold,
      isLowStock: alertRow
        ? isLowStock(alertRow.onHand, alertRow.lowStockThreshold)
        : false,
      copyCount: edition._count.copies,
      holdings: edition.inventory.map((row) => ({
        id: row.id,
        holderType: row.holderType,
        holderId: row.holderId,
        onHand: row.onHand,
        inTransit: row.inTransit,
        sold: row.sold,
        returned: row.returned,
        lost: row.lost,
        lowStockThreshold: row.lowStockThreshold,
        version: row.version,
      })),
    };
  }

  private resolveWritableHolder(
    user: AuthUser,
    publisherId: string,
  ): InventoryHolder {
    if (isSuperAdmin(user.role) || isPublisherRole(user.role)) {
      assertPublisherAccess(user, publisherId);
      const holderId = isSuperAdmin(user.role)
        ? publisherId
        : (user.publisherId as string);
      return this.publisherWarehouse(holderId);
    }
    if (isLibraryRole(user.role) && user.libraryId) {
      return this.libraryHolder(user.libraryId);
    }
    throw new ForbiddenException(
      'Cannot update inventory for this organization',
    );
  }

  private assertOptionalOrgFilters(user: AuthUser, query: InventoryQueryDto) {
    // For library callers publisherId only narrows their own holdings, which
    // inventoryScopeWhere already pins to their library, so it is a filter
    // rather than a claim on the publisher's warehouse.
    if (query.publisherId && !isLibraryRole(user.role)) {
      assertPublisherAccess(user, query.publisherId);
    }
    if (query.libraryId) {
      assertLibraryAccess(user, query.libraryId);
    }
  }
}
