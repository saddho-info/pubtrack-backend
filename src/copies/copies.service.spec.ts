import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CopyBatchStatus,
  CopyStatus,
  MovementType,
} from '../../generated/prisma/client';
import {
  libraryAdminUser,
  publisherAdminUser,
} from '../common/testing/auth-user.fixture';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { CopiesService } from './copies.service';
import { QrService } from './qr.service';

describe('CopiesService', () => {
  let service: CopiesService;
  const prisma = {
    edition: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    copyGenerationBatch: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    bookCopy: {
      createMany: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
    },
    qrCode: {
      createMany: jest.fn(),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const inventory = {
    applyMovement: jest.fn(),
    publisherWarehouse: jest.fn((publisherId: string) => ({
      holderType: 'PUBLISHER',
      holderId: publisherId,
    })),
  };
  const qr = {
    createToken: jest.fn(() => 'opaque-token'),
    toDataUrl: jest.fn(async () => 'data:image/png;base64,AAA'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: typeof prisma) => Promise<unknown>)(prisma);
      }
      return arg;
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CopiesService,
        { provide: PrismaService, useValue: prisma },
        { provide: InventoryService, useValue: inventory },
        { provide: QrService, useValue: qr },
      ],
    }).compile();
    service = module.get(CopiesService);
  });

  it('prints copies, QR tokens, and a warehouse movement in one transaction', async () => {
    prisma.edition.findUnique.mockResolvedValue({
      id: 'ed_1',
      book: { publisherId: 'pub_1' },
    });
    prisma.copyGenerationBatch.findUnique.mockResolvedValue(null);
    prisma.copyGenerationBatch.create.mockResolvedValue({
      id: 'batch_1',
      publisherId: 'pub_1',
      editionId: 'ed_1',
    });
    prisma.edition.update.mockResolvedValue({ nextCopyNumber: 13 });
    prisma.copyGenerationBatch.update.mockResolvedValue({
      id: 'batch_1',
      editionId: 'ed_1',
      publisherId: 'pub_1',
      requestedQuantity: 12,
      createdQuantity: 12,
      status: CopyBatchStatus.COMPLETED,
      idempotencyKey: null,
      createdAt: new Date('2026-08-13T00:00:00Z'),
      updatedAt: new Date('2026-08-13T00:00:00Z'),
    });

    const result = await service.bulkCreate(
      { editionId: 'ed_1', quantity: 12 },
      publisherAdminUser('pub_1'),
    );

    expect(result.createdQuantity).toBe(12);
    expect(result.status).toBe(CopyBatchStatus.COMPLETED);
    expect(prisma.bookCopy.createMany).toHaveBeenCalled();
    expect(prisma.qrCode.createMany).toHaveBeenCalled();
    expect(inventory.applyMovement).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        type: MovementType.PRINT_RECEIPT,
        quantity: 12,
        toDelta: { onHand: 12 },
      }),
    );
  });

  it('replays an existing idempotency key instead of printing again', async () => {
    prisma.edition.findUnique.mockResolvedValue({
      id: 'ed_1',
      book: { publisherId: 'pub_1' },
    });
    prisma.copyGenerationBatch.findUnique.mockResolvedValue({
      id: 'batch_1',
      editionId: 'ed_1',
      publisherId: 'pub_1',
      requestedQuantity: 5,
      createdQuantity: 5,
      status: CopyBatchStatus.COMPLETED,
      idempotencyKey: 'print-1',
      createdAt: new Date('2026-08-13T00:00:00Z'),
      updatedAt: new Date('2026-08-13T00:00:00Z'),
    });

    await service.bulkCreate(
      { editionId: 'ed_1', quantity: 5, idempotencyKey: 'print-1' },
      publisherAdminUser('pub_1'),
    );

    expect(prisma.copyGenerationBatch.create).not.toHaveBeenCalled();
    expect(inventory.applyMovement).not.toHaveBeenCalled();
  });

  it('forbids library staff from generating copies', async () => {
    await expect(
      service.bulkCreate(
        { editionId: 'ed_1', quantity: 1 },
        libraryAdminUser('lib_1'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('forbids printing onto another publisher edition', async () => {
    prisma.edition.findUnique.mockResolvedValue({
      id: 'ed_x',
      book: { publisherId: 'pub_other' },
    });

    await expect(
      service.bulkCreate(
        { editionId: 'ed_x', quantity: 2 },
        publisherAdminUser('pub_1'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('looks up a copy by QR token for the owning publisher', async () => {
    prisma.qrCode.findUnique.mockResolvedValue({
      token: 'opaque-token',
      copy: {
        id: 'copy_1',
        editionId: 'ed_1',
        publisherId: 'pub_1',
        libraryId: null,
        status: CopyStatus.IN_STOCK_PUBLISHER,
        copyNumber: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        qrCode: { token: 'opaque-token' },
        edition: {
          id: 'ed_1',
          isbn: '9781402894626',
          format: 'HARDCOVER',
          title: null,
          listPriceCents: 2499,
          currency: 'USD',
          coverImageUrl: null,
          book: {
            id: 'book_1',
            title: 'The Silent Archive',
            authors: 'Lina Chowdhury',
            publisherId: 'pub_1',
            slug: 'the-silent-archive',
            coverImageUrl: null,
          },
        },
        library: null,
      },
    });

    const copy = await service.findByQrToken(
      'opaque-token',
      publisherAdminUser('pub_1'),
    );
    expect(copy.qrToken).toBe('opaque-token');
    expect(copy.copyNumber).toBe(1);
  });

  it('hides another library copy behind a 404 on QR lookup', async () => {
    prisma.qrCode.findUnique.mockResolvedValue({
      token: 'opaque-token',
      copy: {
        id: 'copy_1',
        publisherId: 'pub_1',
        libraryId: 'lib_other',
        qrCode: { token: 'opaque-token' },
        edition: { book: { publisherId: 'pub_1' } },
        library: { id: 'lib_other' },
      },
    });

    await expect(
      service.findByQrToken('opaque-token', libraryAdminUser('lib_1')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 404 for an unknown QR token', async () => {
    prisma.qrCode.findUnique.mockResolvedValue(null);

    await expect(
      service.findByQrToken('missing', publisherAdminUser('pub_1')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
