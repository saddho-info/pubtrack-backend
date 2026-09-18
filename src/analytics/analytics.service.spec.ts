import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BookFormat,
  InventoryHolderType,
  MovementType,
} from '../../generated/prisma/client';
import {
  libraryAdminUser,
  publisherAdminUser,
  superAdminUser,
} from '../common/testing/auth-user.fixture';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  const prisma = {
    inventory: { findMany: jest.fn() },
    saleItem: {
      aggregate: jest.fn(),
      groupBy: jest.fn(),
    },
    edition: { findMany: jest.fn() },
    sale: { findMany: jest.fn() },
    inventoryMovement: { findMany: jest.fn() },
    library: { findMany: jest.fn() },
    $queryRaw: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.inventory.findMany.mockResolvedValue([]);
    prisma.saleItem.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });
    prisma.saleItem.groupBy.mockResolvedValue([]);
    prisma.edition.findMany.mockResolvedValue([]);
    prisma.sale.findMany.mockResolvedValue([]);
    prisma.inventoryMovement.findMany.mockResolvedValue([]);
    prisma.library.findMany.mockResolvedValue([]);
    prisma.$queryRaw.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(AnalyticsService);
  });

  it('returns a live zero snapshot scoped to the publisher', async () => {
    const snapshot = await service.getOverview(publisherAdminUser('pub_1'), {
      period: '30d',
    });

    expect(snapshot.publisherId).toBe('pub_1');
    expect(snapshot.source).toBe('live');
    expect(snapshot.period.key).toBe('30d');
    expect(snapshot.period.from).toBeTruthy();
    expect(snapshot.kpis).toEqual({
      totalInventory: 0,
      distributed: 0,
      sold: 0,
      warehouse: 0,
      lowStockCount: 0,
    });
    expect(snapshot.libraries).toEqual([]);
    expect(snapshot.lowStock).toEqual([]);
    expect(snapshot.topBooks).toEqual([]);
    expect(snapshot.activity).toEqual([]);
    expect(prisma.inventory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { edition: { book: { publisherId: 'pub_1' } } },
      }),
    );
  });

  it('aggregates inventory KPIs, rankings, low stock, and activity', async () => {
    prisma.inventory.findMany.mockResolvedValue([
      {
        holderType: InventoryHolderType.PUBLISHER,
        onHand: 20,
        lowStockThreshold: 5,
        editionId: 'ed_1',
        edition: {
          format: BookFormat.HARDCOVER,
          title: null,
          publicationDate: new Date('2026-01-01'),
          book: { title: 'The Silent Archive' },
        },
      },
      {
        holderType: InventoryHolderType.PUBLISHER,
        onHand: 2,
        lowStockThreshold: 5,
        editionId: 'ed_2',
        edition: {
          format: BookFormat.PAPERBACK,
          title: null,
          publicationDate: new Date('2025-06-01'),
          book: { title: 'River of Ink' },
        },
      },
      {
        holderType: InventoryHolderType.LIBRARY,
        onHand: 3,
        lowStockThreshold: 5,
        editionId: 'ed_1',
        edition: {
          format: BookFormat.HARDCOVER,
          title: null,
          publicationDate: new Date('2026-01-01'),
          book: { title: 'The Silent Archive' },
        },
      },
    ]);
    prisma.saleItem.aggregate.mockResolvedValue({ _sum: { quantity: 4 } });
    prisma.saleItem.groupBy.mockResolvedValue([
      { editionId: 'ed_1', _sum: { quantity: 4 } },
    ]);
    prisma.edition.findMany.mockResolvedValue([
      {
        id: 'ed_1',
        format: BookFormat.HARDCOVER,
        title: null,
        publicationDate: new Date('2026-01-01'),
        book: { title: 'The Silent Archive' },
      },
    ]);
    prisma.sale.findMany.mockResolvedValue([
      {
        libraryId: 'lib_1',
        library: { name: 'Riverside Public' },
        items: [{ quantity: 3 }, { quantity: 1 }],
      },
    ]);
    prisma.$queryRaw.mockResolvedValue([
      { libraryId: 'lib_1', name: 'Riverside Public', sold: 4 },
    ]);
    prisma.inventoryMovement.findMany.mockResolvedValue([
      {
        id: 'mov_1',
        type: MovementType.SALE,
        quantity: 1,
        reason: null,
        fromHolderType: InventoryHolderType.LIBRARY,
        fromHolderId: 'lib_1',
        toHolderType: null,
        toHolderId: null,
        createdAt: new Date('2026-08-13T12:00:00.000Z'),
        edition: { book: { title: 'The Silent Archive' } },
      },
    ]);
    prisma.library.findMany.mockResolvedValue([
      { id: 'lib_1', name: 'Riverside Public' },
    ]);

    const snapshot = await service.getOverview(publisherAdminUser('pub_1'), {
      period: '30d',
    });

    expect(snapshot.kpis).toEqual({
      totalInventory: 25,
      distributed: 3,
      sold: 4,
      warehouse: 22,
      lowStockCount: 1,
    });
    expect(snapshot.lowStock).toEqual([
      {
        editionId: 'ed_2',
        bookTitle: 'River of Ink',
        editionLabel: 'Paperback · 2025',
        onHand: 2,
        threshold: 5,
      },
    ]);
    expect(snapshot.topBooks).toEqual([
      {
        editionId: 'ed_1',
        bookTitle: 'The Silent Archive',
        editionLabel: 'Hardcover · 2026',
        sold: 4,
      },
    ]);
    expect(snapshot.libraries).toEqual([
      { libraryId: 'lib_1', name: 'Riverside Public', sold: 4 },
    ]);
    expect(snapshot.activity).toEqual([
      {
        id: 'mov_1',
        type: 'SALE',
        title: 'Sale confirmed',
        detail: 'The Silent Archive · Riverside Public',
        occurredAt: '2026-08-13T12:00:00.000Z',
      },
    ]);
  });

  it('uses an open start date for the all-time period', async () => {
    const snapshot = await service.getOverview(publisherAdminUser('pub_1'), {
      period: 'all',
    });

    expect(snapshot.period.key).toBe('all');
    expect(snapshot.period.from).toBeNull();
  });

  it('lets SUPER_ADMIN pass a publisherId and defaults to null', async () => {
    expect(
      (await service.getOverview(superAdminUser, {})).publisherId,
    ).toBeNull();
    expect(
      (await service.getOverview(superAdminUser, { publisherId: 'pub_9' }))
        .publisherId,
    ).toBe('pub_9');
  });

  it('forbids a publisher from requesting another publisher', async () => {
    await expect(
      service.getOverview(publisherAdminUser('pub_1'), {
        publisherId: 'pub_other',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('forbids library users', async () => {
    await expect(
      service.getOverview(libraryAdminUser('lib_1'), {}),
    ).rejects.toThrow(ForbiddenException);
  });

  it('projects top books and library rankings from the snapshot', async () => {
    const user = publisherAdminUser('pub_1');
    const topBooks = await service.getTopBooks(user, { period: '7d' });
    expect(topBooks.period.key).toBe('7d');
    expect(topBooks.data).toEqual([]);

    const libraries = await service.getLibraryPerformance(user, {
      period: '7d',
    });
    expect(libraries.period.key).toBe('7d');
    expect(libraries.data).toEqual([]);
  });
});
