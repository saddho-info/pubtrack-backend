import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CopyStatus,
  DistributionStatus,
  MovementType,
  ReceiptDiscrepancy,
  StockReceiptStatus,
} from '../../generated/prisma/client';
import {
  libraryAdminUser,
  publisherAdminUser,
} from '../common/testing/auth-user.fixture';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReceivingService } from './receiving.service';

const library = {
  id: 'lib_1',
  name: 'Riverside',
  slug: 'riverside',
};
const publisher = { id: 'pub_1', name: 'Northwind', slug: 'northwind' };
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
  book: {
    id: 'book_1',
    title: 'The Silent Archive',
    authors: 'Lina Chowdhury',
    slug: 'the-silent-archive',
  },
};

const distributionRow = {
  id: 'dist_1',
  libraryId: 'lib_1',
  publisherId: 'pub_1',
  status: DistributionStatus.DISPATCHED,
  items: [{ id: 'ditem_1' }],
};

function receiptRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rcpt_1',
    distributionId: 'dist_1',
    libraryId: 'lib_1',
    status: StockReceiptStatus.DRAFT,
    code: 'R-20260814-001',
    notes: null,
    actorUserId: 'user_la',
    confirmedAt: null,
    cancelledAt: null,
    idempotencyKey: null,
    createdAt: new Date('2026-08-14'),
    updatedAt: new Date('2026-08-14'),
    library,
    actor,
    distribution: {
      id: 'dist_1',
      code: 'D-20260814-001',
      status: DistributionStatus.DISPATCHED,
      publisherId: 'pub_1',
      libraryId: 'lib_1',
      notes: null,
      dispatchedAt: new Date('2026-08-14'),
      publisher,
    },
    items: [],
    ...overrides,
  };
}

describe('ReceivingService', () => {
  let service: ReceivingService;
  const prisma = {
    stockReceipt: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn(),
    },
    stockReceiptItem: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      count: jest.fn(),
    },
    distribution: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    bookCopy: {
      update: jest.fn(),
      count: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  const inventory = {
    applyMovement: jest.fn(),
    libraryHolder: jest.fn((libraryId: string) => ({
      holderType: 'LIBRARY',
      holderId: libraryId,
    })),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: typeof prisma) => Promise<unknown>)(prisma);
      }
      return arg;
    });
    prisma.stockReceipt.findUnique.mockResolvedValue(null);
    prisma.stockReceipt.findFirst.mockResolvedValue(null);
    prisma.distribution.findUnique.mockResolvedValue(distributionRow);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReceivingService,
        { provide: PrismaService, useValue: prisma },
        { provide: InventoryService, useValue: inventory },
      ],
    }).compile();
    service = module.get(ReceivingService);
  });

  it('creates a draft receipt against a dispatched shipment', async () => {
    const created = receiptRow();
    prisma.stockReceipt.create.mockResolvedValue(created);
    prisma.stockReceipt.findUniqueOrThrow.mockResolvedValue(created);
    prisma.stockReceipt.findFirst.mockResolvedValueOnce(null);

    const result = await service.create(
      { distributionId: 'dist_1' },
      libraryAdminUser('lib_1'),
    );

    expect(prisma.stockReceipt.create).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(StockReceiptStatus.DRAFT);
    expect(inventory.applyMovement).not.toHaveBeenCalled();
  });

  it('replays an existing receipt when the idempotency key matches', async () => {
    prisma.stockReceipt.findUnique.mockResolvedValue(receiptRow());

    const result = await service.create(
      {
        distributionId: 'dist_1',
        idempotencyKey: 'recv-1',
      },
      libraryAdminUser('lib_1'),
    );

    expect(prisma.stockReceipt.create).not.toHaveBeenCalled();
    expect(result.id).toBe('rcpt_1');
  });

  it('requires an idempotency key when confirming in the same request', async () => {
    await expect(
      service.create(
        { distributionId: 'dist_1', confirm: true },
        libraryAdminUser('lib_1'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('confirms remaining copies, moves inventory, and marks the shipment received', async () => {
    const created = receiptRow();
    prisma.stockReceipt.create.mockResolvedValue(created);
    prisma.stockReceipt.findUniqueOrThrow.mockResolvedValue(created);
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'copy_1',
        status: CopyStatus.DISTRIBUTED,
        editionId: 'ed_1',
        publisherId: 'pub_1',
        libraryId: 'lib_1',
        distributionItemId: 'ditem_1',
      },
      {
        id: 'copy_2',
        status: CopyStatus.DISTRIBUTED,
        editionId: 'ed_1',
        publisherId: 'pub_1',
        libraryId: 'lib_1',
        distributionItemId: 'ditem_1',
      },
    ]);
    prisma.bookCopy.count.mockResolvedValue(0);
    prisma.stockReceipt.update.mockResolvedValue(
      receiptRow({
        status: StockReceiptStatus.CONFIRMED,
        confirmedAt: new Date('2026-08-14'),
        items: [
          {
            id: 'ri_1',
            editionId: 'ed_1',
            copyId: 'copy_1',
            received: true,
            discrepancy: ReceiptDiscrepancy.NONE,
            notes: null,
            createdAt: new Date('2026-08-14'),
            edition,
            copy: {
              id: 'copy_1',
              copyNumber: 1,
              status: CopyStatus.IN_STOCK_LIBRARY,
              publisherId: 'pub_1',
              libraryId: 'lib_1',
              distributionItemId: 'ditem_1',
            },
          },
        ],
      }),
    );

    const result = await service.create(
      { distributionId: 'dist_1', confirm: true, idempotencyKey: 'recv-full' },
      libraryAdminUser('lib_1'),
      'recv-full',
    );

    expect(prisma.bookCopy.update).toHaveBeenCalledTimes(2);
    expect(inventory.applyMovement).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        type: MovementType.RECEIPT,
        editionId: 'ed_1',
        quantity: 1,
        copyId: 'copy_1',
        toDelta: { inTransit: -1, onHand: 1 },
        refType: 'StockReceipt',
      }),
    );
    expect(prisma.distribution.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: DistributionStatus.RECEIVED },
      }),
    );
    expect(result.status).toBe(StockReceiptStatus.CONFIRMED);
  });

  it('flags a partial receive when some copies stay in transit', async () => {
    const created = receiptRow();
    prisma.stockReceipt.create.mockResolvedValue(created);
    prisma.stockReceipt.findUniqueOrThrow.mockResolvedValue(created);
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'copy_1',
        status: CopyStatus.DISTRIBUTED,
        editionId: 'ed_1',
        publisherId: 'pub_1',
        libraryId: 'lib_1',
        distributionItemId: 'ditem_1',
      },
    ]);
    prisma.bookCopy.count.mockResolvedValue(1);
    prisma.stockReceipt.update.mockResolvedValue(
      receiptRow({
        status: StockReceiptStatus.CONFIRMED,
        confirmedAt: new Date('2026-08-14'),
      }),
    );

    await service.create(
      {
        distributionId: 'dist_1',
        confirm: true,
        items: [
          {
            copyId: 'copy_1',
            received: true,
          },
        ],
      },
      libraryAdminUser('lib_1'),
      'recv-partial',
    );

    expect(prisma.distribution.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: DistributionStatus.PARTIALLY_RECEIVED },
      }),
    );
  });

  it('rejects copies that are not on the shipment', async () => {
    const created = receiptRow();
    prisma.stockReceipt.create.mockResolvedValue(created);
    prisma.stockReceipt.findUniqueOrThrow.mockResolvedValue(created);
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'copy_x',
        status: CopyStatus.DISTRIBUTED,
        editionId: 'ed_1',
        publisherId: 'pub_1',
        libraryId: 'lib_1',
        distributionItemId: 'other_item',
      },
    ]);

    await expect(
      service.create(
        {
          distributionId: 'dist_1',
          confirm: true,
          items: [{ copyId: 'copy_x' }],
        },
        libraryAdminUser('lib_1'),
        'recv-bad',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(inventory.applyMovement).not.toHaveBeenCalled();
  });

  it('forbids a publisher user from creating a receipt', async () => {
    await expect(
      service.create({ distributionId: 'dist_1' }, publisherAdminUser('pub_1')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets a publisher user read a receipt for their shipment', async () => {
    prisma.stockReceipt.findUnique.mockResolvedValue(receiptRow());
    const result = await service.findOne('rcpt_1', publisherAdminUser('pub_1'));
    expect(result.id).toBe('rcpt_1');
  });

  it('hides another library receipt from a library admin', async () => {
    prisma.stockReceipt.findUnique.mockResolvedValue(
      receiptRow({ libraryId: 'lib_other' }),
    );

    await expect(
      service.findOne('rcpt_1', libraryAdminUser('lib_1')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects receiving a draft shipment', async () => {
    prisma.distribution.findUnique.mockResolvedValue({
      ...distributionRow,
      status: DistributionStatus.DRAFT,
    });
    prisma.stockReceipt.create.mockResolvedValue(receiptRow());

    await expect(
      service.create({ distributionId: 'dist_1' }, libraryAdminUser('lib_1')),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns 404 when the receipt is missing', async () => {
    prisma.stockReceipt.findUnique.mockResolvedValue(null);
    await expect(
      service.findOne('missing', libraryAdminUser('lib_1')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
