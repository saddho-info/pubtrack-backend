import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  BookFormat,
  CopyBatchStatus,
  CopyStatus,
  DistributionStatus,
  InventoryHolderType,
  MovementType,
  PrismaClient,
  ReceiptDiscrepancy,
  Role,
  StockReceiptStatus,
} from '../generated/prisma/client';
import { hashPassword } from '../src/common/utils/password';
import { generateQrToken } from '../src/common/utils/qr-token';

const DEMO_PASSWORD = 'ChangeMe123!';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to seed');
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const publisher = await prisma.publisher.upsert({
    where: { slug: 'northwind-press' },
    update: {},
    create: {
      name: 'Northwind Press',
      slug: 'northwind-press',
      email: 'ops@northwind.example',
    },
  });

  const library = await prisma.library.upsert({
    where: { slug: 'riverside-public' },
    update: {},
    create: {
      name: 'Riverside Public Library',
      slug: 'riverside-public',
      email: 'desk@riverside.example',
    },
  });

  await prisma.library.upsert({
    where: { slug: 'harbor-community' },
    update: {},
    create: {
      name: 'Harbor Community Library',
      slug: 'harbor-community',
      email: 'hello@harbor.example',
    },
  });

  await prisma.publisherLibrary.upsert({
    where: {
      publisherId_libraryId: {
        publisherId: publisher.id,
        libraryId: library.id,
      },
    },
    update: { isActive: true },
    create: {
      publisherId: publisher.id,
      libraryId: library.id,
      notes: 'Primary Northwind retail partner',
    },
  });

  await prisma.user.upsert({
    where: { email: 'leo.a@example.org' },
    update: { passwordHash, isActive: true },
    create: {
      email: 'leo.a@example.org',
      passwordHash,
      firstName: 'Super',
      lastName: 'Admin',
      role: Role.SUPER_ADMIN,
    },
  });

  await prisma.user.upsert({
    where: { email: 'quinn.m@example.net' },
    update: { passwordHash, publisherId: publisher.id, isActive: true },
    create: {
      email: 'quinn.m@example.net',
      passwordHash,
      firstName: 'Amina',
      lastName: 'Rahman',
      role: Role.PUBLISHER_ADMIN,
      publisherId: publisher.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'walt.e@example.net' },
    update: { passwordHash, libraryId: library.id, isActive: true },
    create: {
      email: 'walt.e@example.net',
      passwordHash,
      firstName: 'Jamal',
      lastName: 'Hossain',
      role: Role.LIBRARY_ADMIN,
      libraryId: library.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'wendy.h@example.net' },
    update: { passwordHash, libraryId: library.id, isActive: true },
    create: {
      email: 'wendy.h@example.net',
      passwordHash,
      firstName: 'Priya',
      lastName: 'Sen',
      role: Role.LIBRARY_STAFF,
      libraryId: library.id,
    },
  });

  const silentArchive = await prisma.book.upsert({
    where: {
      publisherId_slug: {
        publisherId: publisher.id,
        slug: 'the-silent-archive',
      },
    },
    update: {},
    create: {
      publisherId: publisher.id,
      title: 'The Silent Archive',
      subtitle: 'A Northwind Press mystery',
      authors: 'Lina Chowdhury',
      description:
        'A missing ledger, a riverside library, and a publisher who will not let the trail go cold.',
      language: 'en',
      category: 'Mystery',
      slug: 'the-silent-archive',
    },
  });

  const riverOfInk = await prisma.book.upsert({
    where: {
      publisherId_slug: {
        publisherId: publisher.id,
        slug: 'river-of-ink',
      },
    },
    update: {},
    create: {
      publisherId: publisher.id,
      title: 'River of Ink',
      authors: 'Farid Ahmed',
      description: 'Essays on print culture along the Padma.',
      language: 'en',
      category: 'Essays',
      slug: 'river-of-ink',
    },
  });

  const silentHardcover = await prisma.edition.upsert({
    where: { isbn: '9781402894626' },
    update: {},
    create: {
      bookId: silentArchive.id,
      isbn: '9781402894626',
      isbn10: '1402894627',
      format: BookFormat.HARDCOVER,
      listPriceCents: 2499,
      currency: 'USD',
      pageCount: 384,
      publicationDate: new Date('2024-02-01'),
    },
  });

  const riverPaperback = await prisma.edition.upsert({
    where: { isbn: '9780306406157' },
    update: {},
    create: {
      bookId: riverOfInk.id,
      isbn: '9780306406157',
      isbn10: '0306406152',
      format: BookFormat.PAPERBACK,
      listPriceCents: 1499,
      currency: 'USD',
      pageCount: 256,
      publicationDate: new Date('2023-09-15'),
    },
  });

  const silentPaperback = await prisma.edition.upsert({
    where: { isbn: '9783161484100' },
    update: {},
    create: {
      bookId: silentArchive.id,
      isbn: '9783161484100',
      format: BookFormat.PAPERBACK,
      listPriceCents: 1699,
      currency: 'USD',
      pageCount: 368,
      publicationDate: new Date('2024-06-01'),
    },
  });

  const publisherAdmin = await prisma.user.findUniqueOrThrow({
    where: { email: 'quinn.m@example.net' },
  });

  await seedPrintedCopies(prisma, {
    editionId: silentHardcover.id,
    publisherId: publisher.id,
    actorUserId: publisherAdmin.id,
    quantity: 12,
  });
  await seedPrintedCopies(prisma, {
    editionId: silentPaperback.id,
    publisherId: publisher.id,
    actorUserId: publisherAdmin.id,
    quantity: 8,
  });
  await seedPrintedCopies(prisma, {
    editionId: riverPaperback.id,
    publisherId: publisher.id,
    actorUserId: publisherAdmin.id,
    quantity: 6,
  });

  await seedDispatchedShipment(prisma, {
    publisherId: publisher.id,
    libraryId: library.id,
    editionId: silentHardcover.id,
    actorUserId: publisherAdmin.id,
    quantity: 4,
    idempotencyKey: 'seed-riverside-silent-hc',
    code: 'D-20260814-001',
    notes: 'Seed shipment to Riverside Public',
  });

  await seedDispatchedShipment(prisma, {
    publisherId: publisher.id,
    libraryId: library.id,
    editionId: riverPaperback.id,
    actorUserId: publisherAdmin.id,
    quantity: 3,
    idempotencyKey: 'seed-riverside-river-pb',
    code: 'D-20260814-002',
    notes: 'Seed inbound River of Ink paperbacks (awaiting receive)',
  });

  const libraryAdmin = await prisma.user.findUniqueOrThrow({
    where: { email: 'walt.e@example.net' },
  });

  await seedStockReceipt(prisma, {
    publisherId: publisher.id,
    libraryId: library.id,
    editionId: silentHardcover.id,
    actorUserId: libraryAdmin.id,
    distributionKey: 'seed-riverside-silent-hc',
    idempotencyKey: 'seed-riverside-silent-hc-receipt',
  });

  await seedSale(prisma, {
    libraryId: library.id,
    editionId: silentHardcover.id,
    actorUserId: libraryAdmin.id,
  });

  await prisma.$disconnect();
  console.log('Seeded demo users (password: ChangeMe123!)');
  console.log('  leo.a@example.org       SUPER_ADMIN');
  console.log('  quinn.m@example.net   PUBLISHER_ADMIN');
  console.log('  walt.e@example.net     LIBRARY_ADMIN');
  console.log('  wendy.h@example.net    LIBRARY_STAFF');
  console.log('Seeded Northwind Press catalog: The Silent Archive, River of Ink');
  console.log('Seeded warehouse copies: 12 + 8 Silent Archive, 6 River of Ink');
  console.log('Linked Northwind Press → Riverside Public Library');
  console.log('Seeded unlinked library: Harbor Community (slug harbor-community)');
  console.log('Seeded received shipment: 4 Silent Archive hardcovers at Riverside');
  console.log('Seeded inbound shipment: 3 River of Ink paperbacks awaiting receive');
  console.log('Seeded sample sale: 1 Silent Archive hardcover at Riverside');
}

async function seedPrintedCopies(
  prisma: PrismaClient,
  input: {
    editionId: string;
    publisherId: string;
    actorUserId: string;
    quantity: number;
  },
) {
  const existing = await prisma.bookCopy.count({
    where: { editionId: input.editionId },
  });
  if (existing > 0) {
    return;
  }

  const reserved = await prisma.edition.update({
    where: { id: input.editionId },
    data: { nextCopyNumber: { increment: input.quantity } },
    select: { nextCopyNumber: true },
  });
  const startNumber = reserved.nextCopyNumber - input.quantity;
  const copies = Array.from({ length: input.quantity }, (_, index) => ({
    id: randomUUID(),
    editionId: input.editionId,
    publisherId: input.publisherId,
    status: CopyStatus.IN_STOCK_PUBLISHER,
    copyNumber: startNumber + index,
  }));
  await prisma.bookCopy.createMany({ data: copies });
  await prisma.qrCode.createMany({
    data: copies.map((copy) => ({
      id: randomUUID(),
      copyId: copy.id,
      token: generateQrToken(),
    })),
  });

  const batch = await prisma.copyGenerationBatch.create({
    data: {
      publisherId: input.publisherId,
      editionId: input.editionId,
      requestedQuantity: input.quantity,
      createdQuantity: input.quantity,
      status: CopyBatchStatus.COMPLETED,
      actorUserId: input.actorUserId,
      idempotencyKey: `seed-${input.editionId}`,
    },
  });

  await prisma.inventory.upsert({
    where: {
      editionId_holderType_holderId: {
        editionId: input.editionId,
        holderType: InventoryHolderType.PUBLISHER,
        holderId: input.publisherId,
      },
    },
    create: {
      editionId: input.editionId,
      holderType: InventoryHolderType.PUBLISHER,
      holderId: input.publisherId,
      onHand: input.quantity,
      version: 1,
    },
    update: {
      onHand: { increment: input.quantity },
      version: { increment: 1 },
    },
  });

  await prisma.inventoryMovement.create({
    data: {
      type: MovementType.PRINT_RECEIPT,
      editionId: input.editionId,
      quantity: input.quantity,
      toHolderType: InventoryHolderType.PUBLISHER,
      toHolderId: input.publisherId,
      actorUserId: input.actorUserId,
      reason: `Seed print run (${input.quantity})`,
      refType: 'CopyGenerationBatch',
      refId: batch.id,
    },
  });
}

async function seedDispatchedShipment(
  prisma: PrismaClient,
  input: {
    publisherId: string;
    libraryId: string;
    editionId: string;
    actorUserId: string;
    quantity: number;
    idempotencyKey: string;
    code: string;
    notes: string;
  },
) {
  const existing = await prisma.distribution.findUnique({
    where: {
      publisherId_idempotencyKey: {
        publisherId: input.publisherId,
        idempotencyKey: input.idempotencyKey,
      },
    },
  });
  if (existing) {
    return existing;
  }

  const copies = await prisma.bookCopy.findMany({
    where: {
      editionId: input.editionId,
      publisherId: input.publisherId,
      status: CopyStatus.IN_STOCK_PUBLISHER,
      libraryId: null,
      distributionItemId: null,
    },
    orderBy: { copyNumber: 'asc' },
    take: input.quantity,
    select: { id: true },
  });
  if (copies.length < input.quantity) {
    return;
  }

  const distribution = await prisma.distribution.create({
    data: {
      publisherId: input.publisherId,
      libraryId: input.libraryId,
      status: DistributionStatus.DISPATCHED,
      code: input.code,
      notes: input.notes,
      actorUserId: input.actorUserId,
      dispatchedAt: new Date(),
      idempotencyKey: input.idempotencyKey,
      items: {
        create: {
          editionId: input.editionId,
          quantity: input.quantity,
        },
      },
    },
    include: { items: true },
  });
  const item = distribution.items[0];
  if (!item) {
    return;
  }

  await prisma.bookCopy.updateMany({
    where: { id: { in: copies.map((copy) => copy.id) } },
    data: {
      status: CopyStatus.DISTRIBUTED,
      libraryId: input.libraryId,
      distributionItemId: item.id,
    },
  });

  await prisma.inventory.update({
    where: {
      editionId_holderType_holderId: {
        editionId: input.editionId,
        holderType: InventoryHolderType.PUBLISHER,
        holderId: input.publisherId,
      },
    },
    data: {
      onHand: { decrement: input.quantity },
      version: { increment: 1 },
    },
  });

  await prisma.inventory.upsert({
    where: {
      editionId_holderType_holderId: {
        editionId: input.editionId,
        holderType: InventoryHolderType.LIBRARY,
        holderId: input.libraryId,
      },
    },
    create: {
      editionId: input.editionId,
      holderType: InventoryHolderType.LIBRARY,
      holderId: input.libraryId,
      inTransit: input.quantity,
      version: 1,
    },
    update: {
      inTransit: { increment: input.quantity },
      version: { increment: 1 },
    },
  });

  await prisma.inventoryMovement.create({
    data: {
      type: MovementType.DISTRIBUTION,
      editionId: input.editionId,
      quantity: input.quantity,
      fromHolderType: InventoryHolderType.PUBLISHER,
      fromHolderId: input.publisherId,
      toHolderType: InventoryHolderType.LIBRARY,
      toHolderId: input.libraryId,
      actorUserId: input.actorUserId,
      reason: input.notes,
      refType: 'Distribution',
      refId: distribution.id,
    },
  });

  return distribution;
}

/**
 * Confirm a dispatched shipment into library on-hand via StockReceipt.
 */
async function seedStockReceipt(
  prisma: PrismaClient,
  input: {
    publisherId: string;
    libraryId: string;
    editionId: string;
    actorUserId: string;
    distributionKey: string;
    idempotencyKey: string;
  },
) {
  const existing = await prisma.stockReceipt.findUnique({
    where: {
      libraryId_idempotencyKey: {
        libraryId: input.libraryId,
        idempotencyKey: input.idempotencyKey,
      },
    },
  });
  if (existing) {
    return;
  }

  const distribution = await prisma.distribution.findUnique({
    where: {
      publisherId_idempotencyKey: {
        publisherId: input.publisherId,
        idempotencyKey: input.distributionKey,
      },
    },
    include: { items: true },
  });
  if (!distribution) {
    return;
  }

  const copies = await prisma.bookCopy.findMany({
    where: {
      editionId: input.editionId,
      publisherId: input.publisherId,
      libraryId: input.libraryId,
      status: CopyStatus.DISTRIBUTED,
      distributionItemId: { in: distribution.items.map((item) => item.id) },
    },
    orderBy: { copyNumber: 'asc' },
    select: { id: true, editionId: true },
  });
  if (copies.length === 0) {
    return;
  }

  const receipt = await prisma.stockReceipt.create({
    data: {
      distributionId: distribution.id,
      libraryId: input.libraryId,
      status: StockReceiptStatus.CONFIRMED,
      code: 'R-20260814-001',
      notes: 'Seed library receipt',
      actorUserId: input.actorUserId,
      confirmedAt: new Date(),
      idempotencyKey: input.idempotencyKey,
      items: {
        create: copies.map((copy) => ({
          editionId: copy.editionId,
          copyId: copy.id,
          received: true,
          discrepancy: ReceiptDiscrepancy.NONE,
        })),
      },
    },
  });

  await prisma.bookCopy.updateMany({
    where: { id: { in: copies.map((copy) => copy.id) } },
    data: { status: CopyStatus.IN_STOCK_LIBRARY },
  });

  await prisma.distribution.update({
    where: { id: distribution.id },
    data: { status: DistributionStatus.RECEIVED },
  });

  await prisma.inventory.update({
    where: {
      editionId_holderType_holderId: {
        editionId: input.editionId,
        holderType: InventoryHolderType.LIBRARY,
        holderId: input.libraryId,
      },
    },
    data: {
      inTransit: { decrement: copies.length },
      onHand: { increment: copies.length },
      version: { increment: 1 },
    },
  });

  await prisma.inventoryMovement.create({
    data: {
      type: MovementType.RECEIPT,
      editionId: input.editionId,
      quantity: copies.length,
      toHolderType: InventoryHolderType.LIBRARY,
      toHolderId: input.libraryId,
      actorUserId: input.actorUserId,
      reason: 'Seed library receipt',
      refType: 'StockReceipt',
      refId: receipt.id,
    },
  });
}

async function seedSale(
  prisma: PrismaClient,
  input: {
    libraryId: string;
    editionId: string;
    actorUserId: string;
  },
) {
  const existing = await prisma.sale.findUnique({
    where: {
      libraryId_idempotencyKey: {
        libraryId: input.libraryId,
        idempotencyKey: 'seed-riverside-silent-hc-sale',
      },
    },
  });
  if (existing) {
    return;
  }

  const copy = await prisma.bookCopy.findFirst({
    where: {
      editionId: input.editionId,
      libraryId: input.libraryId,
      status: CopyStatus.IN_STOCK_LIBRARY,
    },
    orderBy: { copyNumber: 'asc' },
    include: {
      edition: { select: { listPriceCents: true, currency: true } },
    },
  });
  if (!copy) {
    return;
  }

  const sale = await prisma.sale.create({
    data: {
      libraryId: input.libraryId,
      code: 'S-20260814-001',
      currency: copy.edition.currency,
      totalCents: copy.edition.listPriceCents,
      notes: 'Seed counter sale',
      actorUserId: input.actorUserId,
      soldAt: new Date(),
      idempotencyKey: 'seed-riverside-silent-hc-sale',
      items: {
        create: {
          editionId: input.editionId,
          copyId: copy.id,
          unitPriceCents: copy.edition.listPriceCents,
          quantity: 1,
        },
      },
    },
  });

  await prisma.bookCopy.update({
    where: { id: copy.id },
    data: { status: CopyStatus.SOLD },
  });

  await prisma.inventory.update({
    where: {
      editionId_holderType_holderId: {
        editionId: input.editionId,
        holderType: InventoryHolderType.LIBRARY,
        holderId: input.libraryId,
      },
    },
    data: {
      onHand: { decrement: 1 },
      sold: { increment: 1 },
      version: { increment: 1 },
    },
  });

  await prisma.inventoryMovement.create({
    data: {
      type: MovementType.SALE,
      editionId: input.editionId,
      copyId: copy.id,
      quantity: 1,
      fromHolderType: InventoryHolderType.LIBRARY,
      fromHolderId: input.libraryId,
      actorUserId: input.actorUserId,
      reason: 'Seed counter sale',
      refType: 'Sale',
      refId: sale.id,
    },
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
