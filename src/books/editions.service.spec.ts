import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BookFormat } from '../../generated/prisma/client';
import { publisherAdminUser } from '../common/testing/auth-user.fixture';
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
});
