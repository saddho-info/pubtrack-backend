import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  publisherAdminUser,
  superAdminUser,
} from '../common/testing/auth-user.fixture';
import { PrismaService } from '../prisma/prisma.service';
import { BooksService } from './books.service';

describe('BooksService', () => {
  let service: BooksService;
  const prisma = {
    book: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    publisher: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [BooksService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(BooksService);
  });

  it('creates a book scoped to the publisher and slugifies the title', async () => {
    prisma.publisher.findUnique.mockResolvedValue({ id: 'pub_1' });
    prisma.book.findFirst.mockResolvedValue(null);
    prisma.book.create.mockResolvedValue({
      id: 'book_1',
      title: 'The Silent Archive',
      slug: 'the-silent-archive',
    });

    await service.create(
      { title: 'The Silent Archive', authors: 'Lina Chowdhury' },
      publisherAdminUser('pub_1'),
    );

    expect(prisma.book.create).toHaveBeenCalledTimes(1);
    const calls = prisma.book.create.mock.calls as Array<
      [{ data: { publisherId: string; slug: string; isActive: boolean } }]
    >;
    expect(calls[0]?.[0].data).toMatchObject({
      publisherId: 'pub_1',
      slug: 'the-silent-archive',
      isActive: true,
    });
  });

  it('requires SUPER_ADMIN to pass publisherId', async () => {
    await expect(
      service.create(
        { title: 'Orphan Title', authors: 'Anon' },
        superAdminUser,
      ),
    ).rejects.toThrow('publisherId is required');
  });

  it('returns a paginated list', async () => {
    const rows = [{ id: 'book_1', title: 'The Silent Archive' }];
    prisma.$transaction.mockResolvedValue([rows, 1]);

    await expect(
      service.findAll({ page: 1, limit: 20 }, publisherAdminUser('pub_1')),
    ).resolves.toEqual({
      data: rows,
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  });

  it('throws NotFoundException when the book is missing', async () => {
    prisma.book.findUnique.mockResolvedValue(null);

    await expect(
      service.findOne('missing', superAdminUser),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('forbids a publisher admin from reading another publisher book', async () => {
    prisma.book.findUnique.mockResolvedValue({
      id: 'book_x',
      publisherId: 'pub_other',
    });

    await expect(
      service.findOne('book_x', publisherAdminUser('pub_1')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('updates an existing book', async () => {
    prisma.book.findUnique.mockResolvedValue({
      id: 'book_1',
      publisherId: 'pub_1',
      slug: 'the-silent-archive',
    });
    prisma.book.update.mockResolvedValue({
      id: 'book_1',
      title: 'The Silent Archive (Revised)',
    });

    await expect(
      service.update(
        'book_1',
        { title: 'The Silent Archive (Revised)' },
        publisherAdminUser('pub_1'),
      ),
    ).resolves.toEqual({
      id: 'book_1',
      title: 'The Silent Archive (Revised)',
    });
  });
});
