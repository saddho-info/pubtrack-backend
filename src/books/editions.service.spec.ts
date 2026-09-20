import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BookFormat,
  CopyStatus,
  DistributionStatus,
} from '../../generated/prisma/client';
import {
  publisherAdminUser,
  superAdminUser,
} from '../common/testing/auth-user.fixture';
import { PrismaService } from '../prisma/prisma.service';
import { EditionsService } from './editions.service';

describe('EditionsService', () => {
  let service: EditionsService;
  const prisma = {
    edition: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    book: {
      findUnique: jest.fn(),
    },
    distributionItem: {
      findMany: jest.fn(),
    },
    bookCopy: {
      groupBy: jest.fn(),
    },
    saleItem: {
      findMany: jest.fn(),
    },
    library: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EditionsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(EditionsService);
  });

  it('creates an edition after normalizing a valid ISBN-13', async () => {
    prisma.book.findUnique.mockResolvedValue({
      id: 'book_1',
      publisherId: 'pub_1',
    });
    prisma.edition.create.mockResolvedValue({ id: 'ed_1' });

    await service.create(
      {
        bookId: 'book_1',
        isbn: '978-0-306-40615-7',
        format: BookFormat.PAPERBACK,
        listPriceCents: 1499,
      },
      publisherAdminUser('pub_1'),
    );

    const calls = prisma.edition.create.mock.calls as Array<
      [{ data: { isbn: string; currency: string } }]
    >;
    expect(calls[0]?.[0].data).toMatchObject({
      isbn: '9780306406157',
      currency: 'USD',
    });
  });

  it('rejects an ISBN-13 with a bad check digit', async () => {
    prisma.book.findUnique.mockResolvedValue({
      id: 'book_1',
      publisherId: 'pub_1',
    });

    await expect(
      service.create(
        {
          bookId: 'book_1',
          isbn: '9780306406158',
          format: BookFormat.HARDCOVER,
          listPriceCents: 2000,
        },
        publisherAdminUser('pub_1'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('forbids creating an edition on another publisher book', async () => {
    prisma.book.findUnique.mockResolvedValue({
      id: 'book_x',
      publisherId: 'pub_other',
    });

    await expect(
      service.create(
        {
          bookId: 'book_x',
          isbn: '9780306406157',
          format: BookFormat.PAPERBACK,
          listPriceCents: 999,
        },
        publisherAdminUser('pub_1'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns a paginated list scoped through the parent book', async () => {
    const rows = [{ id: 'ed_1' }];
    prisma.$transaction.mockResolvedValue([rows, 1]);

    await expect(
      service.findAll({ page: 1, limit: 20 }, publisherAdminUser('pub_1')),
    ).resolves.toEqual({
      data: rows,
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  });

  describe('getLibraryPerformance', () => {
    const edition = {
      id: 'ed_hardcover',
      bookId: 'book_1',
      title: null,
      format: BookFormat.HARDCOVER,
      isbn: '9780306406157',
      isbn10: null,
      listPriceCents: 1500,
      currency: 'USD',
      book: {
        id: 'book_1',
        title: 'The Silent Archive',
        authors: 'Author Name',
        publisherId: 'pub_1',
      },
    };

    it('aggregates libraries with reportable statuses while isolating the selected edition', async () => {
      prisma.edition.findUnique.mockResolvedValue(edition);
      prisma.distributionItem.findMany.mockResolvedValue([
        { quantity: 5, distribution: { libraryId: 'lib_a' } },
        { quantity: 7, distribution: { libraryId: 'lib_a' } },
        { quantity: 8, distribution: { libraryId: 'lib_b' } },
        { quantity: 2, distribution: { libraryId: 'lib_zero_stock' } },
      ]);
      prisma.bookCopy.groupBy.mockResolvedValue([
        {
          libraryId: 'lib_a',
          status: CopyStatus.IN_STOCK_LIBRARY,
          _count: { _all: 7 },
        },
        {
          libraryId: 'lib_a',
          status: CopyStatus.DISTRIBUTED,
          _count: { _all: 1 },
        },
        {
          libraryId: 'lib_b',
          status: CopyStatus.IN_STOCK_LIBRARY,
          _count: { _all: 4 },
        },
        {
          libraryId: 'lib_b',
          status: CopyStatus.DISTRIBUTED,
          _count: { _all: 1 },
        },
      ]);
      prisma.saleItem.findMany.mockResolvedValue([
        {
          quantity: 2,
          unitPriceCents: 1500,
          sale: { libraryId: 'lib_a', currency: 'USD' },
        },
        {
          quantity: 2,
          unitPriceCents: 1500,
          sale: { libraryId: 'lib_a', currency: 'USD' },
        },
        {
          quantity: 3,
          unitPriceCents: 1500,
          sale: { libraryId: 'lib_b', currency: 'USD' },
        },
        {
          quantity: 1,
          unitPriceCents: 2000,
          sale: { libraryId: 'lib_b', currency: 'BDT' },
        },
      ]);
      prisma.library.findMany.mockResolvedValue([
        { id: 'lib_b', name: 'Harbor Community Library', slug: 'harbor' },
        { id: 'lib_a', name: 'Riverside Public Library', slug: 'riverside' },
        {
          id: 'lib_zero_stock',
          name: 'Zero Stock Library',
          slug: 'zero-stock',
        },
      ]);

      const result = await service.getLibraryPerformance(
        'ed_hardcover',
        publisherAdminUser('pub_1'),
      );

      expect(result.libraries).toEqual([
        {
          library: {
            id: 'lib_b',
            name: 'Harbor Community Library',
            slug: 'harbor',
          },
          totalDistributed: 8,
          inStock: 4,
          inTransit: 1,
          sold: 4,
          revenueByCurrency: [
            { currency: 'BDT', totalCents: 2000 },
            { currency: 'USD', totalCents: 4500 },
          ],
        },
        {
          library: {
            id: 'lib_a',
            name: 'Riverside Public Library',
            slug: 'riverside',
          },
          totalDistributed: 12,
          inStock: 7,
          inTransit: 1,
          sold: 4,
          revenueByCurrency: [{ currency: 'USD', totalCents: 6000 }],
        },
        {
          library: {
            id: 'lib_zero_stock',
            name: 'Zero Stock Library',
            slug: 'zero-stock',
          },
          totalDistributed: 2,
          inStock: 0,
          inTransit: 0,
          sold: 0,
          revenueByCurrency: [],
        },
      ]);
      expect(result.summary).toEqual({
        libraryCount: 3,
        totalDistributed: 22,
        inStock: 11,
        inTransit: 2,
        sold: 8,
        revenueByCurrency: [
          { currency: 'BDT', totalCents: 2000 },
          { currency: 'USD', totalCents: 10500 },
        ],
      });

      expect(prisma.distributionItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            editionId: 'ed_hardcover',
            distribution: {
              status: {
                in: [
                  DistributionStatus.DISPATCHED,
                  DistributionStatus.PARTIALLY_RECEIVED,
                  DistributionStatus.RECEIVED,
                ],
              },
            },
          },
        }),
      );
      expect(prisma.bookCopy.groupBy).toHaveBeenCalledWith({
        by: ['libraryId', 'status'],
        where: {
          editionId: 'ed_hardcover',
          libraryId: { not: null },
          status: {
            in: [CopyStatus.IN_STOCK_LIBRARY, CopyStatus.DISTRIBUTED],
          },
        },
        _count: { _all: true },
      });
      expect(prisma.saleItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { editionId: 'ed_hardcover' } }),
      );
    });

    it('returns an empty report to a super admin when the edition has no activity', async () => {
      prisma.edition.findUnique.mockResolvedValue(edition);
      prisma.distributionItem.findMany.mockResolvedValue([]);
      prisma.bookCopy.groupBy.mockResolvedValue([]);
      prisma.saleItem.findMany.mockResolvedValue([]);
      prisma.library.findMany.mockResolvedValue([]);

      await expect(
        service.getLibraryPerformance('ed_hardcover', superAdminUser),
      ).resolves.toMatchObject({
        summary: {
          libraryCount: 0,
          totalDistributed: 0,
          inStock: 0,
          inTransit: 0,
          sold: 0,
          revenueByCurrency: [],
        },
        libraries: [],
      });
    });

    it('forbids a publisher user from accessing another publisher edition', async () => {
      prisma.edition.findUnique.mockResolvedValue(edition);

      await expect(
        service.getLibraryPerformance(
          'ed_hardcover',
          publisherAdminUser('pub_other'),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.distributionItem.findMany).not.toHaveBeenCalled();
    });

    it('returns not found when the edition does not exist', async () => {
      prisma.edition.findUnique.mockResolvedValue(null);

      await expect(
        service.getLibraryPerformance('missing', publisherAdminUser('pub_1')),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
