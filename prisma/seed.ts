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
const DEFAULT_SYSTEM_SETTINGS = [
  {
    key: 'platform.name',
    value: 'PubTrack',
    description: 'Display name used across PubTrack applications.',
  },
  {
    key: 'platform.defaultCurrency',
    value: 'USD',
    description: 'Default ISO 4217 currency code for new organizations.',
  },
  {
    key: 'platform.maintenanceMode',
    value: false,
    description: 'Whether platform-wide maintenance mode is enabled.',
  },
] as const;

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

  const extra = await seedExtendedCatalog(prisma, {
    publisherId: publisher.id,
    libraryId: library.id,
    publisherAdminId: publisherAdmin.id,
    libraryAdminId: libraryAdmin.id,
  });

  await seedSystemSettings(prisma);

  await prisma.$disconnect();
  console.log('Seeded demo users (password: ChangeMe123!)');
  console.log('  leo.a@example.org       SUPER_ADMIN');
  console.log('  quinn.m@example.net   PUBLISHER_ADMIN');
  console.log('  walt.e@example.net     LIBRARY_ADMIN');
  console.log('  wendy.h@example.net    LIBRARY_STAFF');
  console.log(
    'Seeded Northwind Press catalog: The Silent Archive, River of Ink',
  );
  console.log('Seeded warehouse copies: 12 + 8 Silent Archive, 6 River of Ink');
  console.log('Linked Northwind Press → Riverside Public Library');
  console.log(
    'Seeded unlinked library: Harbor Community (slug harbor-community)',
  );
  console.log(
    'Seeded received shipment: 4 Silent Archive hardcovers at Riverside',
  );
  console.log(
    'Seeded inbound shipment: 3 River of Ink paperbacks awaiting receive',
  );
  console.log('Seeded sample sale: 1 Silent Archive hardcover at Riverside');
  console.log(
    `Seeded extended catalog: ${extra.books} books, ${extra.editions} editions, ` +
      `${extra.shipments} shipments (${extra.pending} awaiting receive), ${extra.sales} sales`,
  );
  console.log('Seeded low-stock alert: Paper Boats paperback at Riverside');
  console.log('Seeded default system settings');
}

async function seedSystemSettings(prisma: PrismaClient) {
  for (const setting of DEFAULT_SYSTEM_SETTINGS) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    });
  }
}

/**
 * Extra titles so the portal has enough breadth to exercise search,
 * pagination, low stock, pending receipts, and a multi-day sales history.
 */
const EXTRA_CATALOG = [
  {
    slug: 'monsoon-ledger',
    title: 'Monsoon Ledger',
    subtitle: 'Accounts from a flooded city',
    authors: 'Nadia Karim',
    description:
      'A ledger survives the flood. The clerks who balanced it do not.',
    category: 'Mystery',
    editions: [
      {
        isbn: '9780143127741',
        isbn10: '0143127748',
        format: BookFormat.HARDCOVER,
        listPriceCents: 2799,
        pageCount: 412,
        publicationDate: '2025-03-04',
        printRun: 20,
      },
      {
        isbn: '9780307474278',
        isbn10: '0307474275',
        format: BookFormat.PAPERBACK,
        listPriceCents: 1699,
        pageCount: 400,
        publicationDate: '2025-11-18',
        printRun: 30,
      },
    ],
  },
  {
    slug: 'the-cartographers-apprentice',
    title: "The Cartographer's Apprentice",
    subtitle: 'Mapping the last delta',
    authors: 'Imran Bashir',
    description:
      'A surveyor redraws a coastline that refuses to stay where it was drawn.',
    category: 'Historical Fiction',
    editions: [
      {
        isbn: '9780062315007',
        isbn10: '0062315005',
        format: BookFormat.PAPERBACK,
        listPriceCents: 1899,
        pageCount: 352,
        publicationDate: '2025-06-10',
        printRun: 25,
      },
    ],
  },
  {
    slug: 'paper-boats',
    title: 'Paper Boats',
    authors: 'Sadia Noor',
    description: 'Short poems on monsoon, migration, and the rooms between.',
    category: 'Poetry',
    editions: [
      {
        isbn: '9781501110368',
        format: BookFormat.PAPERBACK,
        listPriceCents: 1399,
        pageCount: 128,
        publicationDate: '2026-01-20',
        printRun: 15,
      },
    ],
  },
  {
    slug: 'delta-light',
    title: 'Delta Light',
    authors: 'Rafiq Anwar',
    description: 'Three generations of a printing family on the Meghna.',
    category: 'Literary Fiction',
    editions: [
      {
        isbn: '9780316769488',
        isbn10: '0316769487',
        format: BookFormat.HARDCOVER,
        listPriceCents: 2499,
        pageCount: 296,
        publicationDate: '2026-04-02',
        printRun: 10,
      },
    ],
  },
] as const;

/**
 * Shipments from Northwind to Riverside. A shipment without `receipt` stays
 * DISPATCHED so the Receiving queue has outstanding work to confirm.
 */
const EXTRA_SHIPMENTS = [
  {
    isbn: '9780143127741',
    quantity: 8,
    code: 'D-20260601-101',
    idempotencyKey: 'seed-riverside-monsoon-hc',
    notes: 'Seed shipment: Monsoon Ledger hardcovers',
    receipt: {
      code: 'R-20260601-101',
      idempotencyKey: 'seed-riverside-monsoon-hc-receipt',
      notes: 'Seed receipt: Monsoon Ledger hardcovers',
    },
    sales: [
      {
        code: 'S-20260601-101',
        idempotencyKey: 'seed-monsoon-hc-sale-1',
        quantity: 2,
        daysAgo: 12,
      },
      {
        code: 'S-20260601-102',
        idempotencyKey: 'seed-monsoon-hc-sale-2',
        quantity: 1,
        daysAgo: 3,
      },
    ],
  },
  {
    isbn: '9780307474278',
    quantity: 12,
    code: 'D-20260601-102',
    idempotencyKey: 'seed-riverside-monsoon-pb',
    notes: 'Seed shipment: Monsoon Ledger paperbacks',
    receipt: {
      code: 'R-20260601-102',
      idempotencyKey: 'seed-riverside-monsoon-pb-receipt',
      notes: 'Seed receipt: Monsoon Ledger paperbacks',
    },
    sales: [
      {
        code: 'S-20260601-103',
        idempotencyKey: 'seed-monsoon-pb-sale-1',
        quantity: 3,
        daysAgo: 20,
      },
      {
        code: 'S-20260601-104',
        idempotencyKey: 'seed-monsoon-pb-sale-2',
        quantity: 2,
        daysAgo: 1,
      },
    ],
  },
  {
    isbn: '9780062315007',
    quantity: 10,
    code: 'D-20260601-103',
    idempotencyKey: 'seed-riverside-cartographer-pb',
    notes: "Seed shipment: The Cartographer's Apprentice",
    receipt: {
      code: 'R-20260601-103',
      idempotencyKey: 'seed-riverside-cartographer-pb-receipt',
      notes: "Seed receipt: The Cartographer's Apprentice",
    },
    sales: [
      {
        code: 'S-20260601-105',
        idempotencyKey: 'seed-cartographer-pb-sale-1',
        quantity: 2,
        daysAgo: 7,
      },
    ],
  },
  {
    isbn: '9781501110368',
    quantity: 6,
    code: 'D-20260601-104',
    idempotencyKey: 'seed-riverside-paper-boats-pb',
    notes: 'Seed shipment: Paper Boats',
    receipt: {
      code: 'R-20260601-104',
      idempotencyKey: 'seed-riverside-paper-boats-pb-receipt',
      notes: 'Seed receipt: Paper Boats',
    },
    sales: [
      {
        code: 'S-20260601-106',
        idempotencyKey: 'seed-paper-boats-pb-sale-1',
        quantity: 1,
        daysAgo: 5,
      },
    ],
  },
  {
    isbn: '9780316769488',
    quantity: 5,
    code: 'D-20260601-105',
    idempotencyKey: 'seed-riverside-delta-light-hc',
    notes: 'Seed inbound Delta Light hardcovers (awaiting receive)',
  },
] as const;

/** onHand after sales is 5, so a threshold of 6 puts this title into low stock. */
const LOW_STOCK_ISBN = '9781501110368';
const LOW_STOCK_THRESHOLD = 6;

async function seedExtendedCatalog(
  prisma: PrismaClient,
  input: {
    publisherId: string;
    libraryId: string;
    publisherAdminId: string;
    libraryAdminId: string;
  },
) {
  const editionIdByIsbn = new Map<string, string>();
  let editionCount = 0;

  for (const entry of EXTRA_CATALOG) {
    const book = await prisma.book.upsert({
      where: {
        publisherId_slug: {
          publisherId: input.publisherId,
          slug: entry.slug,
        },
      },
      update: {},
      create: {
        publisherId: input.publisherId,
        title: entry.title,
        subtitle: 'subtitle' in entry ? entry.subtitle : undefined,
        authors: entry.authors,
        description: entry.description,
        language: 'en',
        category: entry.category,
        slug: entry.slug,
      },
    });

    for (const editionSeed of entry.editions) {
      const edition = await prisma.edition.upsert({
        where: { isbn: editionSeed.isbn },
        update: {},
        create: {
          bookId: book.id,
          isbn: editionSeed.isbn,
          isbn10: 'isbn10' in editionSeed ? editionSeed.isbn10 : undefined,
          format: editionSeed.format,
          listPriceCents: editionSeed.listPriceCents,
          currency: 'USD',
          pageCount: editionSeed.pageCount,
          publicationDate: new Date(editionSeed.publicationDate),
        },
      });
      editionIdByIsbn.set(editionSeed.isbn, edition.id);
      editionCount += 1;

      await seedPrintedCopies(prisma, {
        editionId: edition.id,
        publisherId: input.publisherId,
        actorUserId: input.publisherAdminId,
        quantity: editionSeed.printRun,
      });
    }
  }

  let pending = 0;
  let saleCount = 0;

  for (const shipment of EXTRA_SHIPMENTS) {
    const editionId = editionIdByIsbn.get(shipment.isbn);
    if (!editionId) {
      continue;
    }

    await seedDispatchedShipment(prisma, {
      publisherId: input.publisherId,
      libraryId: input.libraryId,
      editionId,
      actorUserId: input.publisherAdminId,
      quantity: shipment.quantity,
      idempotencyKey: shipment.idempotencyKey,
      code: shipment.code,
      notes: shipment.notes,
    });

    if (!('receipt' in shipment)) {
      pending += 1;
      continue;
    }

    await seedStockReceipt(prisma, {
      publisherId: input.publisherId,
      libraryId: input.libraryId,
      editionId,
      actorUserId: input.libraryAdminId,
      distributionKey: shipment.idempotencyKey,
      idempotencyKey: shipment.receipt.idempotencyKey,
      code: shipment.receipt.code,
      notes: shipment.receipt.notes,
    });

    for (const sale of shipment.sales) {
      await seedSale(prisma, {
        libraryId: input.libraryId,
        editionId,
        actorUserId: input.libraryAdminId,
        quantity: sale.quantity,
        code: sale.code,
        idempotencyKey: sale.idempotencyKey,
        notes: 'Seed counter sale',
        soldAt: daysAgo(sale.daysAgo),
      });
      saleCount += 1;
    }
  }

  const lowStockEditionId = editionIdByIsbn.get(LOW_STOCK_ISBN);
  if (lowStockEditionId) {
    await prisma.inventory.updateMany({
      where: {
        editionId: lowStockEditionId,
        holderType: InventoryHolderType.LIBRARY,
        holderId: input.libraryId,
      },
      data: { lowStockThreshold: LOW_STOCK_THRESHOLD },
    });
  }

  return {
    books: EXTRA_CATALOG.length,
    editions: editionCount,
    shipments: EXTRA_SHIPMENTS.length,
    pending,
    sales: saleCount,
  };
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
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
    code?: string;
    notes?: string;
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
      code: input.code ?? 'R-20260814-001',
      notes: input.notes ?? 'Seed library receipt',
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
      reason: input.notes ?? 'Seed library receipt',
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
    quantity?: number;
    code?: string;
    idempotencyKey?: string;
    notes?: string;
    soldAt?: Date;
  },
) {
  const quantity = input.quantity ?? 1;
  const idempotencyKey =
    input.idempotencyKey ?? 'seed-riverside-silent-hc-sale';

  const existing = await prisma.sale.findUnique({
    where: {
      libraryId_idempotencyKey: {
        libraryId: input.libraryId,
        idempotencyKey,
      },
    },
  });
  if (existing) {
    return;
  }

  const copies = await prisma.bookCopy.findMany({
    where: {
      editionId: input.editionId,
      libraryId: input.libraryId,
      status: CopyStatus.IN_STOCK_LIBRARY,
    },
    orderBy: { copyNumber: 'asc' },
    take: quantity,
    include: {
      edition: { select: { listPriceCents: true, currency: true } },
    },
  });
  if (copies.length === 0) {
    return;
  }

  const unitPriceCents = copies[0].edition.listPriceCents;
  const notes = input.notes ?? 'Seed counter sale';

  const sale = await prisma.sale.create({
    data: {
      libraryId: input.libraryId,
      code: input.code ?? 'S-20260814-001',
      currency: copies[0].edition.currency,
      totalCents: unitPriceCents * copies.length,
      notes,
      actorUserId: input.actorUserId,
      soldAt: input.soldAt ?? new Date(),
      idempotencyKey,
      items: {
        create: copies.map((copy) => ({
          editionId: input.editionId,
          copyId: copy.id,
          unitPriceCents: copy.edition.listPriceCents,
          quantity: 1,
        })),
      },
    },
  });

  await prisma.bookCopy.updateMany({
    where: { id: { in: copies.map((copy) => copy.id) } },
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
      onHand: { decrement: copies.length },
      sold: { increment: copies.length },
      version: { increment: 1 },
    },
  });

  await prisma.inventoryMovement.create({
    data: {
      type: MovementType.SALE,
      editionId: input.editionId,
      copyId: copies.length === 1 ? copies[0].id : null,
      quantity: copies.length,
      fromHolderType: InventoryHolderType.LIBRARY,
      fromHolderId: input.libraryId,
      actorUserId: input.actorUserId,
      reason: notes,
      refType: 'Sale',
      refId: sale.id,
    },
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
