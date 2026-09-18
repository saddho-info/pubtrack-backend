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
} from '../../generated/prisma/client';
import {
  libraryAdminUser,
  publisherAdminUser,
  publisherStaffUser,
} from '../common/testing/auth-user.fixture';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { DistributionsService } from './distributions.service';

const library = {
  id: 'lib_1',
  name: 'Riverside',
  slug: 'riverside',
  isActive: true,
};
const publisher = { id: 'pub_1', name: 'Northwind', slug: 'northwind' };
const actor = {
  id: 'user_pa',
  firstName: 'Amina',
  lastName: 'Rahman',
  email: 'quinn.m@example.net',
};
const edition = {
  id: 'ed_1',
  isbn: '9781402894626',
  format: 'HARDCOVER',
  title: null,
  isActive: true,
  book: {
    id: 'book_1',
    title: 'The Silent Archive',
    authors: 'Lina Chowdhury',
    slug: 'the-silent-archive',
    publisherId: 'pub_1',
  },
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

function draftRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'dist_1',
    publisherId: 'pub_1',
    libraryId: 'lib_1',
    status: DistributionStatus.DRAFT,
    code: 'D-20260814-001',
    notes: null,
    actorUserId: 'user_pa',
    dispatchedAt: null,
    cancelledAt: null,
    idempotencyKey: null,
    createdAt: new Date('2026-08-14'),
    updatedAt: new Date('2026-08-14'),
    publisher,
    library,
    actor,
    items: [
      {
        id: 'item_1',
        editionId: 'ed_1',
        quantity: 4,
        createdAt: new Date('2026-08-14'),
        edition,
        copies: [],
      },
    ],
    ...overrides,
  };
}

describe('DistributionsService', () => {
  let service: DistributionsService;
  const prisma = {
    distribution: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn(),
    },
    distributionItem: {
      deleteMany: jest.fn(),
      aggregate: jest.fn(),
    },
    library: {
      findUnique: jest.fn(),
    },
    publisherLibrary: {
      findUnique: jest.fn(),
    },
    edition: {
      findMany: jest.fn(),
    },
    bookCopy: {
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  const inventory = {
    applyMovement: jest.fn(),
    publisherWarehouse: jest.fn((publisherId: string) => ({
      holderType: 'PUBLISHER',
      holderId: publisherId,
    })),
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
    prisma.library.findUnique.mockResolvedValue(library);
    prisma.publisherLibrary.findUnique.mockResolvedValue(linkRow);
    prisma.edition.findMany.mockResolvedValue([edition]);
    prisma.distribution.findFirst.mockResolvedValue(null);
    prisma.distribution.findUnique.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DistributionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: InventoryService, useValue: inventory },
      ],
    }).compile();
    service = module.get(DistributionsService);
  });

  it('creates a draft shipment for a linked library', async () => {
    const created = draftRow();
    prisma.distribution.create.mockResolvedValue(created);

    const result = await service.create(
      {
        libraryId: 'lib_1',
        items: [{ editionId: 'ed_1', quantity: 4 }],
      },
      publisherAdminUser('pub_1'),
    );

    expect(prisma.distribution.create).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(DistributionStatus.DRAFT);
    expect(result.totalQuantity).toBe(4);
    expect(result.code).toMatch(/^D-/);
    expect(inventory.applyMovement).not.toHaveBeenCalled();
  });

  it('replays an existing shipment when the idempotency key matches', async () => {
    prisma.distribution.findUnique.mockResolvedValue(draftRow());

    const result = await service.create(
      {
        libraryId: 'lib_1',
        items: [{ editionId: 'ed_1', quantity: 4 }],
        idempotencyKey: 'alloc-1',
      },
      publisherAdminUser('pub_1'),
    );

    expect(prisma.distribution.create).not.toHaveBeenCalled();
    expect(result.id).toBe('dist_1');
  });

  it('dispatches copies, decrements warehouse on-hand, and marks in-transit', async () => {
    const draft = draftRow();
    prisma.distribution.findUnique.mockResolvedValue(draft);
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'copy_1',
        status: CopyStatus.IN_STOCK_PUBLISHER,
        editionId: 'ed_1',
        publisherId: 'pub_1',
        libraryId: null,
        distributionItemId: null,
      },
      {
        id: 'copy_2',
        status: CopyStatus.IN_STOCK_PUBLISHER,
        editionId: 'ed_1',
        publisherId: 'pub_1',
        libraryId: null,
        distributionItemId: null,
      },
      {
        id: 'copy_3',
        status: CopyStatus.IN_STOCK_PUBLISHER,
        editionId: 'ed_1',
        publisherId: 'pub_1',
        libraryId: null,
        distributionItemId: null,
      },
      {
        id: 'copy_4',
        status: CopyStatus.IN_STOCK_PUBLISHER,
        editionId: 'ed_1',
        publisherId: 'pub_1',
        libraryId: null,
        distributionItemId: null,
      },
    ]);
    prisma.distribution.update.mockResolvedValue(
      draftRow({
        status: DistributionStatus.DISPATCHED,
        dispatchedAt: new Date('2026-08-14'),
      }),
    );

    const result = await service.dispatch(
      'dist_1',
      publisherStaffUser('pub_1'),
    );

    expect(prisma.bookCopy.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.bookCopy.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['copy_1', 'copy_2', 'copy_3', 'copy_4'] } },
      data: {
        status: CopyStatus.DISTRIBUTED,
        libraryId: 'lib_1',
        distributionItemId: 'item_1',
      },
    });
    expect(inventory.applyMovement).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        type: MovementType.DISTRIBUTION,
        editionId: 'ed_1',
        quantity: 4,
        fromDelta: { onHand: -4 },
        toDelta: { inTransit: 4 },
        refType: 'Distribution',
        refId: 'dist_1',
      }),
    );
    expect(result.status).toBe(DistributionStatus.DISPATCHED);
  });

  it('rejects dispatch when warehouse copies are insufficient', async () => {
    prisma.distribution.findUnique.mockResolvedValue(draftRow());
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'copy_1',
        status: CopyStatus.IN_STOCK_PUBLISHER,
        editionId: 'ed_1',
        publisherId: 'pub_1',
        libraryId: null,
        distributionItemId: null,
      },
    ]);

    await expect(
      service.dispatch('dist_1', publisherAdminUser('pub_1')),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(inventory.applyMovement).not.toHaveBeenCalled();
  });

  it('cancels a draft without touching inventory', async () => {
    prisma.distribution.findUnique.mockResolvedValue(draftRow());
    prisma.distribution.update.mockResolvedValue(
      draftRow({
        status: DistributionStatus.CANCELLED,
        cancelledAt: new Date('2026-08-14'),
      }),
    );

    const result = await service.cancel('dist_1', publisherAdminUser('pub_1'));
    expect(result.status).toBe(DistributionStatus.CANCELLED);
    expect(inventory.applyMovement).not.toHaveBeenCalled();
  });

  it('rejects dispatch of a non-draft shipment', async () => {
    prisma.distribution.findUnique.mockResolvedValue(
      draftRow({ status: DistributionStatus.DISPATCHED }),
    );

    await expect(
      service.dispatch('dist_1', publisherAdminUser('pub_1')),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('forbids distributing to an unlinked library', async () => {
    prisma.publisherLibrary.findUnique.mockResolvedValue(null);

    await expect(
      service.create(
        {
          libraryId: 'lib_1',
          items: [{ editionId: 'ed_1', quantity: 1 }],
        },
        publisherAdminUser('pub_1'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('forbids a library user from creating a shipment', async () => {
    await expect(
      service.create(
        {
          libraryId: 'lib_1',
          items: [{ editionId: 'ed_1', quantity: 1 }],
        },
        libraryAdminUser('lib_1'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('hides another publisher shipment from a publisher admin', async () => {
    prisma.distribution.findUnique.mockResolvedValue(
      draftRow({ publisherId: 'pub_other' }),
    );

    await expect(
      service.findOne('dist_1', publisherAdminUser('pub_1')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets a library user read an inbound shipment', async () => {
    prisma.distribution.findUnique.mockResolvedValue(draftRow());

    const result = await service.findOne('dist_1', libraryAdminUser('lib_1'));
    expect(result.id).toBe('dist_1');
  });

  it('rejects duplicate edition lines', async () => {
    await expect(
      service.create(
        {
          libraryId: 'lib_1',
          items: [
            { editionId: 'ed_1', quantity: 1 },
            { editionId: 'ed_1', quantity: 2 },
          ],
        },
        publisherAdminUser('pub_1'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns 404 when the shipment is missing', async () => {
    prisma.distribution.findUnique.mockResolvedValue(null);

    await expect(
      service.findOne('missing', publisherAdminUser('pub_1')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
