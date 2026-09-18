import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CopyStatus,
  SyncTransactionStatus,
  SyncTransactionType,
} from '../../generated/prisma/client';
import {
  libraryAdminUser,
  publisherAdminUser,
} from '../common/testing/auth-user.fixture';
import { PrismaService } from '../prisma/prisma.service';
import { ReceivingService } from '../receiving/receiving.service';
import { SalesService } from '../sales/sales.service';
import { SyncService } from './sync.service';

describe('SyncService', () => {
  let service: SyncService;

  const prisma = {
    syncTransaction: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    bookCopy: {
      findUnique: jest.fn(),
    },
  };
  const sales = { create: jest.fn() };
  const receiving = { create: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncService,
        { provide: PrismaService, useValue: prisma },
        { provide: SalesService, useValue: sales },
        { provide: ReceivingService, useValue: receiving },
      ],
    }).compile();
    service = module.get(SyncService);
  });

  it('rejects non-library actors', async () => {
    await expect(
      service.processBatch(
        {
          transactions: [
            {
              clientId: 'c1',
              type: SyncTransactionType.SALE,
              payload: {},
            },
          ],
        },
        publisherAdminUser('pub_1'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns DUPLICATE for an already-applied clientId', async () => {
    prisma.syncTransaction.findUnique.mockResolvedValue({
      id: 'st_1',
      status: SyncTransactionStatus.APPLIED,
      result: { id: 'sale_1' },
    });

    const result = await service.processBatch(
      {
        transactions: [
          {
            clientId: 'offline-sale-1',
            type: SyncTransactionType.SALE,
            payload: { libraryId: 'lib_1', items: [{ copyId: 'copy_1' }] },
          },
        ],
      },
      libraryAdminUser('lib_1'),
    );

    expect(result.results).toEqual([
      {
        clientId: 'offline-sale-1',
        status: 'DUPLICATE',
        reason: 'DUPLICATE',
        entity: { id: 'sale_1' },
      },
    ]);
    expect(sales.create).not.toHaveBeenCalled();
  });

  it('applies a SALE transaction and marks the sync row APPLIED', async () => {
    prisma.syncTransaction.findUnique.mockResolvedValue(null);
    prisma.syncTransaction.create.mockResolvedValue({
      id: 'st_new',
      status: SyncTransactionStatus.PENDING,
    });
    prisma.bookCopy.findUnique.mockResolvedValue({
      status: CopyStatus.IN_STOCK_LIBRARY,
      libraryId: 'lib_1',
      updatedAt: new Date('2026-09-01'),
    });
    sales.create.mockResolvedValue({ id: 'sale_1', code: 'S-1' });
    prisma.syncTransaction.update.mockResolvedValue({
      id: 'st_new',
      status: SyncTransactionStatus.APPLIED,
    });

    const result = await service.processBatch(
      {
        transactions: [
          {
            clientId: 'offline-sale-2',
            type: SyncTransactionType.SALE,
            payload: {
              libraryId: 'lib_1',
              items: [{ copyId: 'copy_1', unitPriceCents: 1999 }],
            },
          },
        ],
      },
      libraryAdminUser('lib_1'),
    );

    expect(sales.create).toHaveBeenCalledWith(
      expect.objectContaining({
        libraryId: 'lib_1',
        idempotencyKey: 'offline-sale-2',
      }),
      expect.objectContaining({ libraryId: 'lib_1' }),
      'offline-sale-2',
    );
    expect(result.results[0]).toMatchObject({
      clientId: 'offline-sale-2',
      status: SyncTransactionStatus.APPLIED,
      entity: { id: 'sale_1' },
    });
  });

  it('returns REJECTED with ALREADY_SOLD when sales.create fails', async () => {
    prisma.syncTransaction.findUnique.mockResolvedValue(null);
    prisma.syncTransaction.create.mockResolvedValue({
      id: 'st_rej',
      status: SyncTransactionStatus.PENDING,
    });
    prisma.bookCopy.findUnique.mockResolvedValue({
      status: CopyStatus.IN_STOCK_LIBRARY,
      libraryId: 'lib_1',
      updatedAt: new Date('2026-09-01'),
    });
    sales.create.mockRejectedValue(
      new BadRequestException({
        message: 'Copy already sold',
        error: 'ALREADY_SOLD',
      }),
    );
    prisma.syncTransaction.update.mockResolvedValue({
      id: 'st_rej',
      status: SyncTransactionStatus.REJECTED,
    });

    const result = await service.processBatch(
      {
        transactions: [
          {
            clientId: 'offline-sale-3',
            type: SyncTransactionType.SALE,
            payload: {
              libraryId: 'lib_1',
              items: [{ copyId: 'copy_1' }],
            },
          },
        ],
      },
      libraryAdminUser('lib_1'),
    );

    expect(result.results[0]).toMatchObject({
      clientId: 'offline-sale-3',
      status: 'REJECTED',
      reason: 'ALREADY_SOLD',
    });
  });

  it('applies a STOCK_RECEIPT transaction', async () => {
    prisma.syncTransaction.findUnique.mockResolvedValue(null);
    prisma.syncTransaction.create.mockResolvedValue({
      id: 'st_rcpt',
      status: SyncTransactionStatus.PENDING,
    });
    receiving.create.mockResolvedValue({ id: 'rcpt_1', code: 'R-1' });
    prisma.syncTransaction.update.mockResolvedValue({
      id: 'st_rcpt',
      status: SyncTransactionStatus.APPLIED,
    });

    const result = await service.processBatch(
      {
        transactions: [
          {
            clientId: 'offline-rcpt-1',
            type: SyncTransactionType.STOCK_RECEIPT,
            payload: {
              libraryId: 'lib_1',
              distributionId: 'dist_1',
              confirm: true,
            },
          },
        ],
      },
      libraryAdminUser('lib_1'),
    );

    expect(receiving.create).toHaveBeenCalled();
    expect(result.results[0]).toMatchObject({
      clientId: 'offline-rcpt-1',
      status: SyncTransactionStatus.APPLIED,
    });
  });

  it('rejects SALE when copy does not belong to the library', async () => {
    prisma.syncTransaction.findUnique.mockResolvedValue(null);
    prisma.syncTransaction.create.mockResolvedValue({
      id: 'st_inv',
      status: SyncTransactionStatus.PENDING,
    });
    prisma.bookCopy.findUnique.mockResolvedValue({
      status: CopyStatus.IN_STOCK_LIBRARY,
      libraryId: 'other_lib',
      updatedAt: new Date('2026-09-01'),
    });
    prisma.syncTransaction.update.mockResolvedValue({
      id: 'st_inv',
      status: SyncTransactionStatus.REJECTED,
    });

    const result = await service.processBatch(
      {
        transactions: [
          {
            clientId: 'offline-sale-4',
            type: SyncTransactionType.SALE,
            payload: {
              libraryId: 'lib_1',
              items: [{ copyId: 'copy_x' }],
            },
          },
        ],
      },
      libraryAdminUser('lib_1'),
    );

    expect(result.results[0]).toMatchObject({
      status: 'REJECTED',
      reason: 'INVALID_COPY',
    });
    expect(sales.create).not.toHaveBeenCalled();
  });
});
