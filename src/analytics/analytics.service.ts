import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  InventoryHolderType,
  MovementType,
  Prisma,
} from '../../generated/prisma/client';
import {
  AuthUser,
  isPublisherRole,
  isSuperAdmin,
} from '../common/types/auth-user';
import { isLowStock } from '../inventory/inventory.math';
import { PrismaService } from '../prisma/prisma.service';
import {
  activityTitleFromMovement,
  activityTypeFromMovement,
  formatEditionLabel,
  holderLabel,
} from './analytics.labels';
import { OverviewQueryDto } from './dto/overview-query.dto';
import {
  periodRange,
  type OverviewActivityItem,
  type OverviewLibraryRank,
  type OverviewLowStockItem,
  type OverviewPeriod,
  type OverviewSnapshot,
  type OverviewTopBook,
} from './overview.types';

const DEFAULT_PERIOD: OverviewPeriod = '30d';
const TOP_LIMIT = 10;
const LOW_STOCK_LIMIT = 20;
const ACTIVITY_LIMIT = 15;

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSystemOverview() {
    const now = new Date();
    const from = new Date(now);
    from.setUTCDate(from.getUTCDate() - 30);

    const [
      publisherTotal,
      publisherActive,
      libraryTotal,
      libraryActive,
      userTotal,
      userActive,
      usersByRole,
      salesByCurrency,
      saleCount,
      inventory,
      recentAuditActivity,
    ] = await Promise.all([
      this.prisma.publisher.count(),
      this.prisma.publisher.count({ where: { isActive: true } }),
      this.prisma.library.count(),
      this.prisma.library.count({ where: { isActive: true } }),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.groupBy({
        by: ['role'],
        _count: { _all: true },
        orderBy: { role: 'asc' },
      }),
      this.prisma.sale.groupBy({
        by: ['currency'],
        where: { soldAt: { gte: from, lte: now } },
        _sum: { totalCents: true },
        orderBy: { currency: 'asc' },
      }),
      this.prisma.sale.count({
        where: { soldAt: { gte: from, lte: now } },
      }),
      this.prisma.inventory.aggregate({
        _sum: {
          onHand: true,
          inTransit: true,
          sold: true,
          returned: true,
          lost: true,
        },
      }),
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: ACTIVITY_LIMIT,
        include: {
          actor: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
        },
      }),
    ]);

    return {
      generatedAt: now.toISOString(),
      publishers: { total: publisherTotal, active: publisherActive },
      libraries: { total: libraryTotal, active: libraryActive },
      users: {
        total: userTotal,
        active: userActive,
        byRole: Object.fromEntries(
          usersByRole.map((row) => [row.role, row._count._all]),
        ),
      },
      salesLast30Days: {
        from: from.toISOString(),
        to: now.toISOString(),
        count: saleCount,
        totalsByCurrency: salesByCurrency.map((row) => ({
          currency: row.currency,
          totalCents: row._sum.totalCents ?? 0,
        })),
      },
      inventory: {
        onHand: inventory._sum.onHand ?? 0,
        inTransit: inventory._sum.inTransit ?? 0,
        sold: inventory._sum.sold ?? 0,
        returned: inventory._sum.returned ?? 0,
        lost: inventory._sum.lost ?? 0,
      },
      recentAuditActivity,
    };
  }

  async getOverview(
    user: AuthUser,
    query: OverviewQueryDto,
  ): Promise<OverviewSnapshot> {
    const publisherId = this.resolvePublisherId(user, query.publisherId);
    const period = query.period ?? DEFAULT_PERIOD;
    const now = new Date();
    const range = periodRange(period, now);
    const soldAtFilter = this.soldAtFilter(range);

    const [inventoryRows, soldCount, topBooks, libraries, activity] =
      await Promise.all([
        this.loadInventoryRows(publisherId),
        this.countSoldUnits(publisherId, soldAtFilter),
        this.loadTopBooks(publisherId, soldAtFilter),
        this.loadLibraryPerformance(publisherId, soldAtFilter),
        this.loadActivity(publisherId, range),
      ]);

    const warehouse = inventoryRows.filter(
      (row) => row.holderType === InventoryHolderType.PUBLISHER,
    );
    const libraryRows = inventoryRows.filter(
      (row) => row.holderType === InventoryHolderType.LIBRARY,
    );

    const warehouseOnHand = warehouse.reduce((sum, row) => sum + row.onHand, 0);
    const libraryOnHand = libraryRows.reduce((sum, row) => sum + row.onHand, 0);
    const lowStock = this.toLowStockItems(warehouse);

    return {
      publisherId,
      source: 'live',
      generatedAt: now.toISOString(),
      period: {
        key: period,
        from: range.from,
        to: range.to,
      },
      kpis: {
        totalInventory: warehouseOnHand + libraryOnHand,
        distributed: libraryOnHand,
        sold: soldCount,
        warehouse: warehouseOnHand,
        lowStockCount: lowStock.length,
      },
      libraries,
      lowStock: lowStock.slice(0, LOW_STOCK_LIMIT),
      topBooks,
      activity,
    };
  }

  async getTopBooks(user: AuthUser, query: OverviewQueryDto) {
    const overview = await this.getOverview(user, query);
    return { period: overview.period, data: overview.topBooks };
  }

  async getLibraryPerformance(user: AuthUser, query: OverviewQueryDto) {
    const overview = await this.getOverview(user, query);
    return { period: overview.period, data: overview.libraries };
  }

  private resolvePublisherId(
    user: AuthUser,
    requestedPublisherId?: string,
  ): string | null {
    if (isSuperAdmin(user.role)) {
      return requestedPublisherId ?? null;
    }

    if (!isPublisherRole(user.role) || !user.publisherId) {
      throw new ForbiddenException('Publisher analytics only');
    }

    if (requestedPublisherId && requestedPublisherId !== user.publisherId) {
      throw new ForbiddenException('Cannot access another publisher');
    }

    return user.publisherId;
  }

  private soldAtFilter(range: {
    from: string | null;
    to: string;
  }): Prisma.DateTimeFilter {
    if (range.from) {
      return { gte: new Date(range.from), lte: new Date(range.to) };
    }
    return { lte: new Date(range.to) };
  }

  private publisherEditionFilter(
    publisherId: string | null,
  ): Prisma.EditionWhereInput | undefined {
    return publisherId ? { book: { publisherId } } : undefined;
  }

  private async loadInventoryRows(publisherId: string | null) {
    return this.prisma.inventory.findMany({
      where: {
        ...(publisherId ? { edition: { book: { publisherId } } } : {}),
      },
      select: {
        holderType: true,
        onHand: true,
        lowStockThreshold: true,
        editionId: true,
        edition: {
          select: {
            format: true,
            title: true,
            publicationDate: true,
            book: { select: { title: true } },
          },
        },
      },
    });
  }

  private toLowStockItems(
    warehouseRows: Awaited<ReturnType<AnalyticsService['loadInventoryRows']>>,
  ): OverviewLowStockItem[] {
    return warehouseRows
      .filter((row) => isLowStock(row.onHand, row.lowStockThreshold))
      .sort(
        (a, b) =>
          a.onHand - b.onHand ||
          a.edition.book.title.localeCompare(b.edition.book.title),
      )
      .map((row) => ({
        editionId: row.editionId,
        bookTitle: row.edition.book.title,
        editionLabel: formatEditionLabel(row.edition),
        onHand: row.onHand,
        threshold: row.lowStockThreshold,
      }));
  }

  private async countSoldUnits(
    publisherId: string | null,
    soldAt: Prisma.DateTimeFilter,
  ): Promise<number> {
    const result = await this.prisma.saleItem.aggregate({
      where: {
        edition: this.publisherEditionFilter(publisherId),
        sale: { soldAt },
      },
      _sum: { quantity: true },
    });
    return result._sum.quantity ?? 0;
  }

  private async loadTopBooks(
    publisherId: string | null,
    soldAt: Prisma.DateTimeFilter,
  ): Promise<OverviewTopBook[]> {
    const grouped = await this.prisma.saleItem.groupBy({
      by: ['editionId'],
      where: {
        edition: this.publisherEditionFilter(publisherId),
        sale: { soldAt },
      },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: TOP_LIMIT,
    });

    if (grouped.length === 0) {
      return [];
    }

    const editions = await this.prisma.edition.findMany({
      where: { id: { in: grouped.map((row) => row.editionId) } },
      select: {
        id: true,
        format: true,
        title: true,
        publicationDate: true,
        book: { select: { title: true } },
      },
    });
    const byId = new Map(editions.map((edition) => [edition.id, edition]));

    return grouped.flatMap((row) => {
      const edition = byId.get(row.editionId);
      if (!edition) {
        return [];
      }
      return [
        {
          editionId: edition.id,
          bookTitle: edition.book.title,
          editionLabel: formatEditionLabel(edition),
          sold: row._sum.quantity ?? 0,
        },
      ];
    });
  }

  private async loadLibraryPerformance(
    publisherId: string | null,
    soldAt: Prisma.DateTimeFilter,
  ): Promise<OverviewLibraryRank[]> {
    const from = soldAt.gte instanceof Date ? soldAt.gte : undefined;
    const to = soldAt.lte instanceof Date ? soldAt.lte : new Date();

    type RankRow = { libraryId: string; name: string; sold: number | bigint };

    const dateFilter = from
      ? Prisma.sql`AND s."soldAt" >= ${from} AND s."soldAt" <= ${to}`
      : Prisma.sql`AND s."soldAt" <= ${to}`;
    const publisherFilter = publisherId
      ? Prisma.sql`AND b."publisherId" = ${publisherId}`
      : Prisma.sql``;

    const rows = await this.prisma.$queryRaw<RankRow[]>(Prisma.sql`
      SELECT
        s."libraryId" AS "libraryId",
        l.name AS name,
        COALESCE(SUM(si.quantity), 0)::int AS sold
      FROM "SaleItem" si
      INNER JOIN "Sale" s ON s.id = si."saleId"
      INNER JOIN "Library" l ON l.id = s."libraryId"
      INNER JOIN "Edition" e ON e.id = si."editionId"
      INNER JOIN "Book" b ON b.id = e."bookId"
      WHERE 1=1
        ${dateFilter}
        ${publisherFilter}
      GROUP BY s."libraryId", l.name
      HAVING SUM(si.quantity) > 0
      ORDER BY sold DESC, l.name ASC
      LIMIT ${TOP_LIMIT}
    `);

    return rows.map((row) => ({
      libraryId: row.libraryId,
      name: row.name,
      sold: Number(row.sold),
    }));
  }

  private async loadActivity(
    publisherId: string | null,
    range: { from: string | null; to: string },
  ): Promise<OverviewActivityItem[]> {
    const createdAt: Prisma.DateTimeFilter = range.from
      ? { gte: new Date(range.from), lte: new Date(range.to) }
      : { lte: new Date(range.to) };

    const movements = await this.prisma.inventoryMovement.findMany({
      where: {
        createdAt,
        ...(publisherId ? { edition: { book: { publisherId } } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: ACTIVITY_LIMIT,
      select: {
        id: true,
        type: true,
        quantity: true,
        reason: true,
        fromHolderType: true,
        fromHolderId: true,
        toHolderType: true,
        toHolderId: true,
        createdAt: true,
        edition: {
          select: {
            book: { select: { title: true } },
          },
        },
      },
    });

    const libraryIds = new Set<string>();
    for (const movement of movements) {
      if (
        movement.fromHolderType === InventoryHolderType.LIBRARY &&
        movement.fromHolderId
      ) {
        libraryIds.add(movement.fromHolderId);
      }
      if (
        movement.toHolderType === InventoryHolderType.LIBRARY &&
        movement.toHolderId
      ) {
        libraryIds.add(movement.toHolderId);
      }
    }

    const libraries =
      libraryIds.size > 0
        ? await this.prisma.library.findMany({
            where: { id: { in: [...libraryIds] } },
            select: { id: true, name: true },
          })
        : [];
    const librariesById = new Map(
      libraries.map((library) => [library.id, library.name]),
    );

    return movements.map((movement) => ({
      id: movement.id,
      type: activityTypeFromMovement(movement.type),
      title: activityTitleFromMovement(movement.type),
      detail: this.activityDetail(movement, librariesById),
      occurredAt: movement.createdAt.toISOString(),
    }));
  }

  private activityDetail(
    movement: {
      type: MovementType;
      quantity: number;
      reason: string | null;
      fromHolderType: InventoryHolderType | null;
      fromHolderId: string | null;
      toHolderType: InventoryHolderType | null;
      toHolderId: string | null;
      edition: { book: { title: string } };
    },
    librariesById: Map<string, string>,
  ): string {
    const bookTitle = movement.edition.book.title;
    const from = holderLabel(
      movement.fromHolderType,
      movement.fromHolderId,
      librariesById,
    );
    const to = holderLabel(
      movement.toHolderType,
      movement.toHolderId,
      librariesById,
    );

    switch (movement.type) {
      case MovementType.SALE:
        return from ? `${bookTitle} · ${from}` : bookTitle;
      case MovementType.DISTRIBUTION:
        return to
          ? `${movement.quantity} copies to ${to}`
          : `${movement.quantity} copies · ${bookTitle}`;
      case MovementType.RECEIPT:
        return from || to
          ? `${to ?? from} confirmed ${movement.quantity} of ${movement.quantity} copies`
          : `${bookTitle} · ${movement.quantity} copies`;
      case MovementType.PRINT_RECEIPT:
        return `${bookTitle} · ${movement.quantity} copies`;
      default:
        if (movement.reason) {
          return `${bookTitle} · ${movement.reason}`;
        }
        return `${bookTitle} · ${movement.quantity} copies`;
    }
  }
}
