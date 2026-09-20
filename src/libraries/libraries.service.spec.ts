import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  libraryAdminUser,
  publisherAdminUser,
  superAdminUser,
} from '../common/testing/auth-user.fixture';
import {
  DistributionStatus,
  InventoryHolderType,
  Role,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LibrariesService } from './libraries.service';

const libraryRow = {
  id: 'lib_1',
  name: 'Riverside Public',
  slug: 'riverside-public',
  email: 'desk@riverside.example',
  phone: null,
  address: null,
  isActive: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  _count: { users: 1 },
};

const linkRow = {
  id: 'link_1',
  publisherId: 'pub_1',
  libraryId: 'lib_1',
  isActive: true,
  notes: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('LibrariesService', () => {
  let service: LibrariesService;
  const prisma = {
    library: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    publisherLibrary: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    publisher: {
      findUnique: jest.fn(),
    },
    inventory: {
      groupBy: jest.fn(),
      aggregate: jest.fn(),
    },
    bookCopy: {
      groupBy: jest.fn(),
    },
    distributionItem: {
      aggregate: jest.fn(),
    },
    sale: {
      groupBy: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.library.findFirst.mockResolvedValue(null);
    prisma.publisher.findUnique.mockResolvedValue({ id: 'pub_1' });
    prisma.inventory.groupBy.mockResolvedValue([]);
    prisma.inventory.aggregate.mockResolvedValue({
      _sum: { onHand: null, inTransit: null, sold: null },
    });
    prisma.bookCopy.groupBy.mockResolvedValue([]);
    prisma.distributionItem.aggregate.mockResolvedValue({
      _sum: { quantity: null },
    });
    prisma.sale.groupBy.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: typeof prisma) => Promise<unknown>)(prisma);
      }
      return Promise.all(arg as Promise<unknown>[]);
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LibrariesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(LibrariesService);
  });

  it('creates a library, slugifies the name, and auto-links the publisher', async () => {
    prisma.library.create.mockResolvedValue(libraryRow);
    prisma.publisherLibrary.create.mockResolvedValue(linkRow);

    const result = await service.create(
      { name: 'Riverside Public' },
      publisherAdminUser('pub_1'),
    );

    expect(prisma.library.create).toHaveBeenCalledTimes(1);
    const calls = prisma.library.create.mock.calls as Array<
      [{ data: { name: string; slug: string; isActive: boolean } }]
    >;
    expect(calls[0]?.[0].data).toMatchObject({
      name: 'Riverside Public',
      slug: 'riverside-public',
      isActive: true,
    });
    expect(prisma.publisherLibrary.create).toHaveBeenCalledWith({
      data: {
        publisherId: 'pub_1',
        libraryId: 'lib_1',
        notes: undefined,
      },
    });
    expect(result.link?.publisherId).toBe('pub_1');
  });

  it('lets SUPER_ADMIN create a library without linking', async () => {
    prisma.library.create.mockResolvedValue(libraryRow);

    const result = await service.create(
      { name: 'Riverside Public' },
      superAdminUser,
    );

    expect(prisma.publisherLibrary.create).not.toHaveBeenCalled();
    expect(result.link).toBeNull();
  });

  it('throws NotFoundException when the library is missing', async () => {
    prisma.library.findUnique.mockResolvedValue(null);

    await expect(
      service.findOne('missing', superAdminUser),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('forbids a library admin from reading another library', async () => {
    prisma.library.findUnique.mockResolvedValue({
      ...libraryRow,
      id: 'lib_other',
    });

    await expect(
      service.findOne('lib_other', libraryAdminUser('lib_1')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('forbids a publisher from reading an unlinked library', async () => {
    prisma.library.findUnique.mockResolvedValue(libraryRow);
    prisma.publisherLibrary.findUnique.mockResolvedValue(null);

    await expect(
      service.findOne('lib_1', publisherAdminUser('pub_1')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns a linked library for the publisher', async () => {
    prisma.library.findUnique.mockResolvedValue(libraryRow);
    prisma.publisherLibrary.findUnique.mockResolvedValue(linkRow);

    const result = await service.findOne('lib_1', publisherAdminUser('pub_1'));
    expect(result.id).toBe('lib_1');
    expect(result.link?.id).toBe('link_1');
  });

  it('links an existing library by slug', async () => {
    prisma.library.findUnique.mockResolvedValue(libraryRow);
    prisma.publisherLibrary.findUnique.mockResolvedValue(null);
    prisma.publisherLibrary.create.mockResolvedValue(linkRow);

    const result = await service.link(
      { slug: 'riverside-public' },
      publisherAdminUser('pub_1'),
    );

    expect(result.link?.publisherId).toBe('pub_1');
    expect(prisma.publisherLibrary.create).toHaveBeenCalledTimes(1);
  });

  it('rejects a duplicate link', async () => {
    prisma.library.findUnique.mockResolvedValue(libraryRow);
    prisma.publisherLibrary.findUnique.mockResolvedValue(linkRow);

    await expect(
      service.link({ libraryId: 'lib_1' }, publisherAdminUser('pub_1')),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects linking an inactive library', async () => {
    prisma.library.findUnique.mockResolvedValue({
      ...libraryRow,
      isActive: false,
    });

    await expect(
      service.link({ slug: 'riverside-public' }, publisherAdminUser('pub_1')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('unlinks a partnership', async () => {
    prisma.library.findUnique.mockResolvedValue(libraryRow);
    prisma.publisherLibrary.findUnique.mockResolvedValue(linkRow);
    prisma.publisherLibrary.delete.mockResolvedValue(linkRow);

    await service.unlink('lib_1', publisherAdminUser('pub_1'));

    expect(prisma.publisherLibrary.delete).toHaveBeenCalledWith({
      where: { id: 'link_1' },
    });
  });

  it('forbids publisher staff from managing links', async () => {
    const staff = {
      ...publisherAdminUser('pub_1'),
      role: Role.PUBLISHER_STAFF,
    };

    await expect(
      service.create({ name: 'New Branch' }, staff),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  describe('library search', () => {
    it('scopes search results to the authenticated publisher', async () => {
      prisma.library.findMany.mockResolvedValue([]);
      prisma.library.count.mockResolvedValue(0);

      await service.findAll(
        { search: 'Riverside', page: 1, limit: 10 },
        publisherAdminUser('pub_1'),
      );

      expect(prisma.library.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            publisherLinks: { some: { publisherId: 'pub_1' } },
          }),
          skip: 0,
          take: 10,
        }),
      );
    });

    it('uses the existing case-insensitive library name search', async () => {
      prisma.library.findMany.mockResolvedValue([]);
      prisma.library.count.mockResolvedValue(0);

      await service.findAll(
        { search: 'rIvErSiDe', page: 1, limit: 10 },
        publisherAdminUser('pub_1'),
      );

      expect(prisma.library.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              {
                name: {
                  contains: 'rIvErSiDe',
                  mode: 'insensitive',
                },
              },
            ]),
          }),
        }),
      );
    });
  });

  describe('getPublisherPerformance', () => {
    const performanceLibrary = {
      id: 'lib_1',
      name: 'Riverside Public',
      slug: 'riverside-public',
    };

    beforeEach(() => {
      prisma.library.findFirst.mockResolvedValue(performanceLibrary);
    });

    it('returns the sum of reportable distribution quantities', async () => {
      prisma.distributionItem.aggregate.mockResolvedValue({
        _sum: { quantity: 120 },
      });

      const result = await service.getPublisherPerformance(
        'lib_1',
        publisherAdminUser('pub_1'),
      );

      expect(result.summary.totalDistributed).toBe(120);
    });

    it('excludes draft and cancelled distributions', async () => {
      await service.getPublisherPerformance(
        'lib_1',
        publisherAdminUser('pub_1'),
      );

      expect(prisma.distributionItem.aggregate).toHaveBeenCalledWith({
        where: {
          edition: { book: { publisherId: 'pub_1' } },
          distribution: {
            publisherId: 'pub_1',
            libraryId: 'lib_1',
            status: {
              in: [
                DistributionStatus.DISPATCHED,
                DistributionStatus.PARTIALLY_RECEIVED,
                DistributionStatus.RECEIVED,
              ],
            },
          },
        },
        _sum: { quantity: true },
      });
    });

    it('returns canonical library on-hand inventory as inStock', async () => {
      prisma.inventory.aggregate.mockResolvedValue({
        _sum: { onHand: 45, inTransit: 0, sold: 0 },
      });

      const result = await service.getPublisherPerformance(
        'lib_1',
        publisherAdminUser('pub_1'),
      );

      expect(result.summary.inStock).toBe(45);
    });

    it('returns canonical library in-transit inventory', async () => {
      prisma.inventory.aggregate.mockResolvedValue({
        _sum: { onHand: 0, inTransit: 10, sold: 0 },
      });

      const result = await service.getPublisherPerformance(
        'lib_1',
        publisherAdminUser('pub_1'),
      );

      expect(result.summary.inTransit).toBe(10);
    });

    it('returns canonical library sold inventory', async () => {
      prisma.inventory.aggregate.mockResolvedValue({
        _sum: { onHand: 0, inTransit: 0, sold: 60 },
      });

      const result = await service.getPublisherPerformance(
        'lib_1',
        publisherAdminUser('pub_1'),
      );

      expect(result.summary.sold).toBe(60);
    });

    it('sums the existing finalized sale total field', async () => {
      prisma.sale.groupBy.mockResolvedValue([
        { currency: 'BDT', _sum: { totalCents: 1500000 } },
      ]);

      const result = await service.getPublisherPerformance(
        'lib_1',
        publisherAdminUser('pub_1'),
      );

      expect(result.summary.revenueByCurrency).toEqual([
        { currency: 'BDT', totalCents: 1500000 },
      ]);
      expect(prisma.sale.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ _sum: { totalCents: true } }),
      );
    });

    it('does not calculate revenue from sale item unit prices or quantities', async () => {
      prisma.sale.groupBy.mockResolvedValue([
        { currency: 'USD', _sum: { totalCents: 4321 } },
      ]);

      const result = await service.getPublisherPerformance(
        'lib_1',
        publisherAdminUser('pub_1'),
      );

      expect(result.summary.revenueByCurrency[0]?.totalCents).toBe(4321);
      expect(prisma.sale.groupBy).toHaveBeenCalledTimes(1);
    });

    it('does not read edition list price to recalculate revenue', async () => {
      await service.getPublisherPerformance(
        'lib_1',
        publisherAdminUser('pub_1'),
      );

      const revenueQuery = prisma.sale.groupBy.mock.calls[0]?.[0] as object;
      expect(JSON.stringify(revenueQuery)).not.toContain('listPriceCents');
      expect(JSON.stringify(revenueQuery)).not.toContain('unitPriceCents');
    });

    it('scopes sale totals by the selected library and authenticated publisher', async () => {
      await service.getPublisherPerformance(
        'lib_1',
        publisherAdminUser('pub_1'),
      );

      expect(prisma.sale.groupBy).toHaveBeenCalledWith({
        by: ['currency'],
        where: {
          libraryId: 'lib_1',
          items: {
            some: { edition: { book: { publisherId: 'pub_1' } } },
          },
        },
        _sum: { totalCents: true },
        orderBy: { currency: 'asc' },
      });
    });

    it('scopes distribution and inventory aggregates against other publishers', async () => {
      await service.getPublisherPerformance(
        'lib_1',
        publisherAdminUser('pub_1'),
      );

      expect(prisma.inventory.aggregate).toHaveBeenCalledWith({
        where: {
          holderType: InventoryHolderType.LIBRARY,
          holderId: 'lib_1',
          edition: { book: { publisherId: 'pub_1' } },
        },
        _sum: { onHand: true, inTransit: true, sold: true },
      });
      expect(prisma.distributionItem.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            edition: { book: { publisherId: 'pub_1' } },
            distribution: expect.objectContaining({
              publisherId: 'pub_1',
              libraryId: 'lib_1',
            }),
          }),
        }),
      );
    });

    it('returns multiple currencies separately', async () => {
      prisma.sale.groupBy.mockResolvedValue([
        { currency: 'BDT', _sum: { totalCents: 1500000 } },
        { currency: 'USD', _sum: { totalCents: 2500 } },
      ]);

      const result = await service.getPublisherPerformance(
        'lib_1',
        publisherAdminUser('pub_1'),
      );

      expect(result.summary.revenueByCurrency).toEqual([
        { currency: 'BDT', totalCents: 1500000 },
        { currency: 'USD', totalCents: 2500 },
      ]);
    });

    it('returns zero counts and empty revenue for no activity', async () => {
      await expect(
        service.getPublisherPerformance(
          'lib_1',
          publisherAdminUser('pub_1'),
        ),
      ).resolves.toEqual({
        library: performanceLibrary,
        summary: {
          totalDistributed: 0,
          inStock: 0,
          inTransit: 0,
          sold: 0,
          revenueByCurrency: [],
        },
      });
    });

    it('rejects callers without an authenticated publisher scope', async () => {
      await expect(
        service.getPublisherPerformance('lib_1', libraryAdminUser('lib_1')),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prisma.library.findFirst).not.toHaveBeenCalled();
    });

    it('returns a tenant-safe not found response for inaccessible libraries', async () => {
      prisma.library.findFirst.mockResolvedValue(null);

      await expect(
        service.getPublisherPerformance(
          'lib_other',
          publisherAdminUser('pub_1'),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.distributionItem.aggregate).not.toHaveBeenCalled();
      expect(prisma.inventory.aggregate).not.toHaveBeenCalled();
      expect(prisma.sale.groupBy).not.toHaveBeenCalled();
    });

    it('uses independent aggregates so joins cannot double-count records', async () => {
      await service.getPublisherPerformance(
        'lib_1',
        publisherAdminUser('pub_1'),
      );

      expect(prisma.distributionItem.aggregate).toHaveBeenCalledTimes(1);
      expect(prisma.inventory.aggregate).toHaveBeenCalledTimes(1);
      expect(prisma.sale.groupBy).toHaveBeenCalledTimes(1);
    });
  });
});
