import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CopyStatus, MovementType } from '../../generated/prisma/client';
import {
  libraryAdminUser,
  publisherAdminUser,
} from '../common/testing/auth-user.fixture';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { SalesService } from './sales.service';

const library = {
  id: 'lib_1',
  name: 'Riverside',
  slug: 'riverside',
  isActive: true,
};
const actor = {
  id: 'user_la',
  firstName: 'Jamal',
  lastName: 'Hossain',
  email: 'walt.e@example.net',
};
const edition = {
  id: 'ed_1',
  isbn: '9781402894626',
  format: 'HARDCOVER',
  title: null,
  listPriceCents: 2499,
  currency: 'USD',
  book: {
    id: 'book_1',
    title: 'The Silent Archive',
    authors: 'Lina Chowdhury',
    slug: 'the-silent-archive',
    publisherId: 'pub_1',
  },
};

function saleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sale_1',
    libraryId: 'lib_1',
    code: 'S-20260814-001',
    currency: 'USD',
    totalCents: 2499,
    notes: null,
    actorUserId: 'user_la',
    soldAt: new Date('2026-08-14'),
    idempotencyKey: 'sale-key-1',
    createdAt: new Date('2026-08-14'),
    updatedAt: new Date('2026-08-14'),
    library,
    actor,
    items: [
      {
        id: 'si_1',
        saleId: 'sale_1',
        editionId: 'ed_1',
        copyId: 'copy_1',
        unitPriceCents: 2499,
        quantity: 1,
        createdAt: new Date('2026-08-14'),
        edition,
        copy: {
          id: 'copy_1',
          copyNumber: 1,
          status: CopyStatus.SOLD,
          publisherId: 'pub_1',
          libraryId: 'lib_1',
        },
      },
    ],
    ...overrides,
  };
}

describe('SalesService', () => {
  let service: SalesService;
  const applyMovement = jest.fn().mockResolvedValue({ movementId: 'mov_1' });
  const libraryHolder = jest.fn((libraryId: string) => ({
    holderType: 'LIBRARY',
    holderId: libraryId,
  }));

  const prisma = {
    sale: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      aggregate: jest.fn(),
    },
    saleItem: {
      count: jest.fn(),
    },
    library: {
      findUnique: jest.fn(),
    },
    bookCopy: {
      update: jest.fn(),
    },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      async (fn: (tx: typeof prisma) => Promise<unknown>) => {
        if (typeof fn === 'function') {
          return fn(prisma);
        }
        return Promise.all(fn as unknown as Promise<unknown>[]);
      },
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: InventoryService,
          useValue: { applyMovement, libraryHolder },
        },
      ],
    }).compile();

    service = module.get(SalesService);
  });

  it('replays an existing sale for the same idempotency key', async () => {
    const existing = saleRow();
    prisma.sale.findUnique.mockResolvedValue(existing);

    const result = await service.create(
      {
        items: [{ copyId: 'copy_1' }],
        idempotencyKey: 'sale-key-1',
      },
      libraryAdminUser('lib_1'),
      'sale-key-1',
    );

    expect(result.id).toBe('sale_1');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(applyMovement).not.toHaveBeenCalled();
  });

  it('requires an idempotency key', async () => {
    await expect(
      service.create(
        { items: [{ copyId: 'copy_1' }] },
        libraryAdminUser('lib_1'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('forbids publisher writers from creating sales', async () => {
    await expect(
      service.create(
        {
          items: [{ copyId: 'copy_1' }],
          idempotencyKey: 'k1',
        },
        publisherAdminUser('pub_1'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('sells a library copy and applies a SALE movement', async () => {
    prisma.sale.findUnique.mockResolvedValue(null);
    prisma.library.findUnique.mockResolvedValue(library);
    prisma.sale.findFirst.mockResolvedValue(null);
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'copy_1',
        status: CopyStatus.IN_STOCK_LIBRARY,
        editionId: 'ed_1',
        publisherId: 'pub_1',
        libraryId: 'lib_1',
        listPriceCents: 2499,
        currency: 'USD',
      },
    ]);
    const created = saleRow();
    prisma.sale.create.mockResolvedValue(created);
    prisma.bookCopy.update.mockResolvedValue({ id: 'copy_1' });

    const result = await service.create(
      {
        items: [{ copyId: 'copy_1' }],
        notes: 'Counter sale',
      },
      libraryAdminUser('lib_1'),
      'sale-key-new',
    );

    expect(result.code).toBe('S-20260814-001');
    expect(prisma.bookCopy.update).toHaveBeenCalledWith({
      where: { id: 'copy_1' },
      data: { status: CopyStatus.SOLD },
    });
    expect(applyMovement).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        type: MovementType.SALE,
        editionId: 'ed_1',
        quantity: 1,
        copyId: 'copy_1',
        fromDelta: { onHand: -1, sold: 1 },
        refType: 'Sale',
        refId: 'sale_1',
      }),
    );
  });

  it('rejects already-sold copies with ALREADY_SOLD', async () => {
    prisma.sale.findUnique.mockResolvedValue(null);
    prisma.library.findUnique.mockResolvedValue(library);
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'copy_1',
        status: CopyStatus.SOLD,
        editionId: 'ed_1',
        publisherId: 'pub_1',
        libraryId: 'lib_1',
        listPriceCents: 2499,
        currency: 'USD',
      },
    ]);

    await expect(
      service.create(
        { items: [{ copyId: 'copy_1' }] },
        libraryAdminUser('lib_1'),
        'sale-key-sold',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'ALREADY_SOLD' }),
    });
  });

  it('rejects copies that are not in library stock', async () => {
    prisma.sale.findUnique.mockResolvedValue(null);
    prisma.library.findUnique.mockResolvedValue(library);
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'copy_1',
        status: CopyStatus.DISTRIBUTED,
        editionId: 'ed_1',
        publisherId: 'pub_1',
        libraryId: 'lib_1',
        listPriceCents: 2499,
        currency: 'USD',
      },
    ]);

    await expect(
      service.create(
        { items: [{ copyId: 'copy_1' }] },
        libraryAdminUser('lib_1'),
        'sale-key-bad',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'INVALID_COPY' }),
    });
  });

  it('lets a publisher read a sale for their own editions', async () => {
    prisma.sale.findUnique.mockResolvedValue(saleRow());
    const result = await service.findOne('sale_1', publisherAdminUser('pub_1'));
    expect(result.id).toBe('sale_1');
  });

  it('forbids a publisher from reading another publisher sale', async () => {
    prisma.sale.findUnique.mockResolvedValue(saleRow());
    await expect(
      service.findOne('sale_1', publisherAdminUser('pub_other')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns 404 for a missing sale', async () => {
    prisma.sale.findUnique.mockResolvedValue(null);
    await expect(
      service.findOne('missing', libraryAdminUser('lib_1')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
