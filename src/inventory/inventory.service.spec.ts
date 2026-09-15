import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  InventoryHolderType,
  MovementType,
} from '../../generated/prisma/client';
import {
  libraryAdminUser,
  publisherAdminUser,
  superAdminUser,
} from '../common/testing/auth-user.fixture';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from './inventory.service';

describe('InventoryService', () => {
  let service: InventoryService;
  const prisma = {
    edition: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
    },
    inventory: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    inventoryMovement: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
    bookCopy: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(InventoryService);
  });

  it('creates a warehouse row and a PRINT_RECEIPT movement', async () => {
    const tx = {
      inventory: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'inv_1' }),
        update: jest.fn(),
      },
      inventoryMovement: {
        create: jest.fn().mockResolvedValue({ id: 'mov_1' }),
      },
      bookCopy: { findUnique: jest.fn() },
    };

    await expect(
      service.applyMovement(tx as never, {
        type: MovementType.PRINT_RECEIPT,
        editionId: 'ed_1',
        quantity: 12,
        to: {
          holderType: InventoryHolderType.PUBLISHER,
          holderId: 'pub_1',
        },
        toDelta: { onHand: 12 },
        actorUserId: 'user_pa',
        refType: 'CopyGenerationBatch',
        refId: 'batch_1',
      }),
    ).resolves.toEqual({ movementId: 'mov_1' });

    expect(tx.inventory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        editionId: 'ed_1',
        holderType: InventoryHolderType.PUBLISHER,
        holderId: 'pub_1',
        onHand: 12,
        version: 1,
      }),
    });
    expect(tx.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: MovementType.PRINT_RECEIPT,
          quantity: 12,
          toHolderId: 'pub_1',
        }),
      }),
    );
  });

  it('rejects a sale that would drive on-hand negative', async () => {
    const tx = {
      inventory: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'inv_1',
          onHand: 0,
          inTransit: 0,
          sold: 0,
          returned: 0,
          lost: 0,
        }),
        create: jest.fn(),
        update: jest.fn(),
      },
      inventoryMovement: { create: jest.fn() },
      bookCopy: { findUnique: jest.fn() },
    };

    await expect(
      service.applyMovement(tx as never, {
        type: MovementType.SALE,
        editionId: 'ed_1',
        quantity: 1,
        from: {
          holderType: InventoryHolderType.LIBRARY,
          holderId: 'lib_1',
        },
        fromDelta: { onHand: -1, sold: 1 },
        actorUserId: 'user_la',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.inventory.update).not.toHaveBeenCalled();
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('returns warehouse and library KPI totals', async () => {
    prisma.inventory.findMany.mockResolvedValue([
      {
        holderType: InventoryHolderType.PUBLISHER,
        onHand: 10,
        inTransit: 2,
        sold: 0,
        returned: 0,
        lost: 0,
        lowStockThreshold: 5,
      },
      {
        holderType: InventoryHolderType.LIBRARY,
        onHand: 4,
        inTransit: 0,
        sold: 3,
        returned: 0,
        lost: 1,
        lowStockThreshold: 5,
      },
      {
        holderType: InventoryHolderType.PUBLISHER,
        onHand: 2,
        inTransit: 0,
        sold: 0,
        returned: 0,
        lost: 0,
        lowStockThreshold: 5,
      },
    ]);

    await expect(
      service.getSummary(publisherAdminUser('pub_1'), {}),
    ).resolves.toEqual({
      warehouseOnHand: 12,
      libraryOnHand: 4,
      inTransit: 2,
      sold: 3,
      returned: 0,
      lost: 1,
      totalOnHand: 16,
      lowStockCount: 1,
    });
  });

  it('blocks a publisher from filtering another publisher', async () => {
    await expect(
      service.getSummary(publisherAdminUser('pub_1'), {
        publisherId: 'pub_other',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets SUPER_ADMIN read unscoped inventory', async () => {
    prisma.$transaction.mockResolvedValue([[], 0]);

    await expect(
      service.findAll({ page: 1, limit: 20 }, superAdminUser),
    ).resolves.toEqual({
      data: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
  });

  it('scopes library inventory reads to the caller library', async () => {
    prisma.$transaction.mockResolvedValue([[], 0]);

    await service.findAll({ page: 1, limit: 20 }, libraryAdminUser('lib_1'));

    const findManyCalls = prisma.edition.findMany.mock.calls as Array<
      [{ where: { inventory?: unknown } }]
    >;
    expect(findManyCalls[0]?.[0].where.inventory).toEqual({
      some: { holderType: InventoryHolderType.LIBRARY, holderId: 'lib_1' },
    });
  });
});
