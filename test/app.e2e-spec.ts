import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { Role } from '../generated/prisma/client';
import { hashPassword } from './../src/common/utils/password';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from './../src/prisma/prisma.service';

type OrgResponse = {
  id: string;
  name: string;
  slug: string;
};

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; role: string };
};

type BookResponse = {
  id: string;
  title: string;
  slug: string;
  publisherId: string;
  editions?: Array<{ id: string; isbn: string }>;
};

type EditionResponse = {
  id: string;
  isbn: string;
  bookId: string;
  listPriceCents: number;
};

type DistributionResponse = {
  id: string;
  code: string;
  status: string;
  libraryId: string;
  publisherId: string;
  totalQuantity: number;
  items: Array<{ id: string; editionId: string; quantity: number }>;
};

type SaleResponse = {
  id: string;
  code: string;
  libraryId: string;
  totalCents: number;
  itemCount: number;
  items: Array<{ copyId: string; editionId: string; unitPriceCents: number }>;
};

type StockReceiptResponse = {
  id: string;
  code: string;
  status: string;
  libraryId: string;
  distributionId: string;
  receivedCount: number;
  discrepancyCount: number;
  items: Array<{ copyId: string; received: boolean; discrepancy: string }>;
};

function isbn13FromUnique(digits9: string): string {
  const body = `979${digits9.padStart(9, '0').slice(-9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    sum += Number(body[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return `${body}${check}`;
}

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('/api/v1 (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1')
      .expect(200)
      .expect({ status: 'ok', service: 'pubtrack-backend' });
  });

  it('/api/v1/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect({ status: 'ok', service: 'pubtrack-backend' });
  });

  it('rejects unauthenticated library publisher performance requests', () => {
    return request(app.getHttpServer())
      .get('/api/v1/libraries/library-id/publisher-performance')
      .expect(401);
  });
});

describe('Auth and tenant isolation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let publisherAId: string;
  let publisherBId: string;
  let libraryId: string;
  let superAdminToken: string;
  let publisherAToken: string;
  let libraryToken: string;
  const suffix = `${Date.now()}`;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const publisherA = await prisma.publisher.create({
      data: { name: 'Auth Press A', slug: `auth-press-a-${suffix}` },
    });
    const publisherB = await prisma.publisher.create({
      data: { name: 'Auth Press B', slug: `auth-press-b-${suffix}` },
    });
    const library = await prisma.library.create({
      data: { name: 'Auth Library', slug: `auth-lib-${suffix}` },
    });
    publisherAId = publisherA.id;
    publisherBId = publisherB.id;
    libraryId = library.id;

    const passwordHash = await hashPassword('ChangeMe123!');
    await prisma.user.createMany({
      data: [
        {
          email: `sa-${suffix}@pubtrack.test`,
          passwordHash,
          firstName: 'Super',
          lastName: 'Admin',
          role: Role.SUPER_ADMIN,
        },
        {
          email: `pa-${suffix}@pubtrack.test`,
          passwordHash,
          firstName: 'Pub',
          lastName: 'Admin',
          role: Role.PUBLISHER_ADMIN,
          publisherId: publisherAId,
        },
        {
          email: `la-${suffix}@pubtrack.test`,
          passwordHash,
          firstName: 'Lib',
          lastName: 'Admin',
          role: Role.LIBRARY_ADMIN,
          libraryId,
        },
      ],
    });

    const login = async (email: string) => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'ChangeMe123!' })
        .expect(200);
      return (res.body as AuthResponse).accessToken;
    };

    superAdminToken = await login(`sa-${suffix}@pubtrack.test`);
    publisherAToken = await login(`pa-${suffix}@pubtrack.test`);
    libraryToken = await login(`la-${suffix}@pubtrack.test`);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.bookCopy.updateMany({
        where: { publisherId: { in: [publisherAId, publisherBId] } },
        data: { distributionItemId: null },
      });
      await prisma.sale.deleteMany({
        where: {
          OR: [
            { libraryId },
            {
              items: {
                some: {
                  copy: {
                    publisherId: { in: [publisherAId, publisherBId] },
                  },
                },
              },
            },
          ],
        },
      });
      await prisma.stockReceipt.deleteMany({
        where: {
          OR: [
            { libraryId },
            {
              distribution: {
                publisherId: { in: [publisherAId, publisherBId] },
              },
            },
          ],
        },
      });
      await prisma.distribution.deleteMany({
        where: { publisherId: { in: [publisherAId, publisherBId] } },
      });
      await prisma.inventoryMovement.deleteMany({
        where: {
          edition: {
            book: { publisherId: { in: [publisherAId, publisherBId] } },
          },
        },
      });
      await prisma.inventory.deleteMany({
        where: {
          edition: {
            book: { publisherId: { in: [publisherAId, publisherBId] } },
          },
        },
      });
      await prisma.qrCode.deleteMany({
        where: { copy: { publisherId: { in: [publisherAId, publisherBId] } } },
      });
      await prisma.bookCopy.deleteMany({
        where: { publisherId: { in: [publisherAId, publisherBId] } },
      });
      await prisma.copyGenerationBatch.deleteMany({
        where: { publisherId: { in: [publisherAId, publisherBId] } },
      });
      await prisma.edition.deleteMany({
        where: { book: { publisherId: { in: [publisherAId, publisherBId] } } },
      });
      await prisma.book.deleteMany({
        where: { publisherId: { in: [publisherAId, publisherBId] } },
      });
      await prisma.user.deleteMany({
        where: { email: { endsWith: `${suffix}@pubtrack.test` } },
      });
      await prisma.publisher.deleteMany({
        where: { id: { in: [publisherAId, publisherBId] } },
      });
      await prisma.library.deleteMany({ where: { id: libraryId } });
    }
    if (app) {
      await app.close();
    }
  });

  it('rejects login with a wrong password', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: `sa-${suffix}@pubtrack.test`, password: 'wrong' })
      .expect(401);
  });

  it('returns the current user from /auth/me', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .expect(200)
      .expect((res) => {
        expect((res.body as { email: string }).email).toBe(
          `sa-${suffix}@pubtrack.test`,
        );
      });
  });

  it('rotates refresh tokens', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: `sa-${suffix}@pubtrack.test`,
        password: 'ChangeMe123!',
      })
      .expect(200);

    const first = loginRes.body as AuthResponse;
    const refreshRes = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(200);

    const rotated = refreshRes.body as AuthResponse;
    expect(rotated.accessToken).toBeTruthy();
    expect(rotated.refreshToken).not.toBe(first.refreshToken);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(401);
  });

  it('keeps a second session when the first refreshes or logs out', async () => {
    const credentials = {
      email: `sa-${suffix}@pubtrack.test`,
      password: 'ChangeMe123!',
    };

    const firstLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send(credentials)
      .expect(200);
    const secondLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send(credentials)
      .expect(200);

    const first = firstLogin.body as AuthResponse;
    const second = secondLogin.body as AuthResponse;

    const rotatedFirst = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(200);

    const stillSecond = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: second.refreshToken })
      .expect(200);

    expect((rotatedFirst.body as AuthResponse).refreshToken).not.toBe(
      first.refreshToken,
    );
    expect((stillSecond.body as AuthResponse).refreshToken).toBeTruthy();

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken: (rotatedFirst.body as AuthResponse).refreshToken })
      .expect(204);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({
        refreshToken: (rotatedFirst.body as AuthResponse).refreshToken,
      })
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({
        refreshToken: (stillSecond.body as AuthResponse).refreshToken,
      })
      .expect(200);
  });

  it('requires auth for publisher writes', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/publishers')
      .send({ name: 'No Auth Press' })
      .expect(401);
  });

  it('lets SUPER_ADMIN create and patch a publisher', async () => {
    const slug = `e2e-pub-${suffix}`;
    const created = await request(app.getHttpServer())
      .post('/api/v1/publishers')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name: 'E2E Press', slug, email: 'e2e-pub@example.com' })
      .expect(201);

    const createdBody = created.body as OrgResponse;
    expect(createdBody.slug).toBe(slug);

    await request(app.getHttpServer())
      .get(`/api/v1/publishers/${createdBody.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/publishers/${createdBody.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name: 'E2E Press Updated' })
      .expect(200)
      .expect((res) => {
        expect((res.body as OrgResponse).name).toBe('E2E Press Updated');
      });

    await prisma.publisher.delete({ where: { id: createdBody.id } });
  });

  it('rejects unknown publisher fields', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/publishers')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name: 'Bad Press', extra: true })
      .expect(400);
  });

  it('forbids a publisher admin from reading another publisher', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/publishers/${publisherBId}`)
      .set('Authorization', `Bearer ${publisherAToken}`)
      .expect(403);
  });

  it('forbids a library user from listing publishers', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/publishers')
      .set('Authorization', `Bearer ${libraryToken}`)
      .expect(403);
  });

  it('creates and reads a library as SUPER_ADMIN', async () => {
    const slug = `e2e-lib-${suffix}`;
    const created = await request(app.getHttpServer())
      .post('/api/v1/libraries')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name: 'E2E Library', slug })
      .expect(201);

    const createdBody = created.body as OrgResponse;

    await request(app.getHttpServer())
      .get(`/api/v1/libraries/${createdBody.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .expect(200);

    await prisma.library.delete({ where: { id: createdBody.id } });
  });

  it('lets a publisher create a library and hides unlinked libraries', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/libraries')
      .set('Authorization', `Bearer ${publisherAToken}`)
      .send({ name: 'Publisher A Branch', slug: `pub-a-branch-${suffix}` })
      .expect(201);

    const createdBody = created.body as OrgResponse & {
      link: { publisherId: string } | null;
    };
    expect(createdBody.link?.publisherId).toBe(publisherAId);

    const list = await request(app.getHttpServer())
      .get('/api/v1/libraries')
      .set('Authorization', `Bearer ${publisherAToken}`)
      .expect(200);

    const listBody = list.body as { data: OrgResponse[] };
    expect(listBody.data.some((row) => row.id === createdBody.id)).toBe(true);
    expect(listBody.data.some((row) => row.id === libraryId)).toBe(false);

    await request(app.getHttpServer())
      .get(`/api/v1/libraries/${libraryId}`)
      .set('Authorization', `Bearer ${publisherAToken}`)
      .expect(403);

    await prisma.library.delete({ where: { id: createdBody.id } });
  });

  it('links and unlinks an existing library by slug', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/libraries/links')
      .set('Authorization', `Bearer ${publisherAToken}`)
      .send({ slug: `auth-lib-${suffix}` })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/v1/libraries/${libraryId}`)
      .set('Authorization', `Bearer ${publisherAToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/libraries/links')
      .set('Authorization', `Bearer ${publisherAToken}`)
      .send({ libraryId })
      .expect(409);

    await request(app.getHttpServer())
      .delete(`/api/v1/libraries/${libraryId}/link`)
      .set('Authorization', `Bearer ${publisherAToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/api/v1/libraries/${libraryId}`)
      .set('Authorization', `Bearer ${publisherAToken}`)
      .expect(403);
  });

  it('lets a library user read their own library', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/libraries/${libraryId}`)
      .set('Authorization', `Bearer ${libraryToken}`)
      .expect(200);
  });

  it('returns a live overview for a publisher and forbids library users', async () => {
    const overview = await request(app.getHttpServer())
      .get('/api/v1/analytics/overview')
      .query({ period: '30d' })
      .set('Authorization', `Bearer ${publisherAToken}`)
      .expect(200);

    expect(overview.body).toMatchObject({
      publisherId: publisherAId,
      source: 'live',
      kpis: {
        totalInventory: 0,
        distributed: 0,
        sold: 0,
      },
      libraries: [],
      lowStock: [],
      topBooks: [],
      activity: [],
    });

    const topBooks = await request(app.getHttpServer())
      .get('/api/v1/analytics/top-books')
      .set('Authorization', `Bearer ${publisherAToken}`)
      .expect(200);

    const topBooksBody = topBooks.body as {
      period: { key: string };
      data: unknown[];
    };
    expect(topBooksBody.period.key).toBe('30d');
    expect(topBooksBody.data).toEqual([]);

    await request(app.getHttpServer())
      .get('/api/v1/analytics/overview')
      .set('Authorization', `Bearer ${libraryToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/v1/analytics/overview')
      .expect(401);

    await request(app.getHttpServer())
      .get('/api/v1/analytics/overview')
      .query({ period: '1y' })
      .set('Authorization', `Bearer ${publisherAToken}`)
      .expect(400);
  });

  it('lets a publisher create a book and edition and forbids cross-tenant reads', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/books')
      .set('Authorization', `Bearer ${publisherAToken}`)
      .send({
        title: 'E2E Ledger',
        authors: 'Test Author',
        category: 'Fiction',
      })
      .expect(201);

    const book = created.body as BookResponse;
    expect(book.publisherId).toBe(publisherAId);
    expect(book.slug).toBe('e2e-ledger');

    const isbn = isbn13FromUnique(suffix.slice(-9));
    const editionRes = await request(app.getHttpServer())
      .post('/api/v1/editions')
      .set('Authorization', `Bearer ${publisherAToken}`)
      .send({
        bookId: book.id,
        isbn,
        format: 'PAPERBACK',
        listPriceCents: 1299,
      })
      .expect(201);

    const edition = editionRes.body as EditionResponse;
    expect(edition.isbn).toBe(isbn);
    expect(edition.listPriceCents).toBe(1299);

    await request(app.getHttpServer())
      .get(`/api/v1/books/${book.id}`)
      .set('Authorization', `Bearer ${publisherAToken}`)
      .expect(200)
      .expect((res) => {
        const body = res.body as BookResponse;
        expect(body.editions?.[0]?.isbn).toBe(isbn);
      });

    const otherBook = await prisma.book.create({
      data: {
        publisherId: publisherBId,
        title: 'Other Press Title',
        authors: 'Other',
        slug: `other-press-${suffix}`,
      },
    });

    await request(app.getHttpServer())
      .get(`/api/v1/books/${otherBook.id}`)
      .set('Authorization', `Bearer ${publisherAToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/v1/books')
      .set('Authorization', `Bearer ${libraryToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/v1/editions')
      .set('Authorization', `Bearer ${publisherAToken}`)
      .send({
        bookId: book.id,
        isbn: '9780306406158',
        format: 'HARDCOVER',
        listPriceCents: 2000,
      })
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/api/v1/books/${book.id}`)
      .set('Authorization', `Bearer ${publisherAToken}`)
      .send({ title: 'E2E Ledger Revised' })
      .expect(200)
      .expect((res) => {
        expect((res.body as BookResponse).title).toBe('E2E Ledger Revised');
      });
  });

  it('allocates and dispatches copies to a linked library', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/libraries/links')
      .set('Authorization', `Bearer ${publisherAToken}`)
      .send({ slug: `auth-lib-${suffix}` })
      .expect(201);

    const bookRes = await request(app.getHttpServer())
      .post('/api/v1/books')
      .set('Authorization', `Bearer ${publisherAToken}`)
      .send({
        title: 'E2E Distribution Title',
        authors: 'Test Author',
      })
      .expect(201);
    const book = bookRes.body as BookResponse;

    const isbn = isbn13FromUnique(`${suffix.slice(-8)}1`);
    const editionRes = await request(app.getHttpServer())
      .post('/api/v1/editions')
      .set('Authorization', `Bearer ${publisherAToken}`)
      .send({
        bookId: book.id,
        isbn,
        format: 'PAPERBACK',
        listPriceCents: 999,
      })
      .expect(201);
    const edition = editionRes.body as EditionResponse;

    await request(app.getHttpServer())
      .post('/api/v1/copies/bulk')
      .set('Authorization', `Bearer ${publisherAToken}`)
      .send({ editionId: edition.id, quantity: 6 })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post('/api/v1/distributions')
      .set('Authorization', `Bearer ${publisherAToken}`)
      .set('Idempotency-Key', `dist-${suffix}`)
      .send({
        libraryId,
        items: [{ editionId: edition.id, quantity: 3 }],
      })
      .expect(201);

    const draft = created.body as DistributionResponse;
    expect(draft.status).toBe('DRAFT');
    expect(draft.totalQuantity).toBe(3);
    expect(draft.libraryId).toBe(libraryId);

    const replay = await request(app.getHttpServer())
      .post('/api/v1/distributions')
      .set('Authorization', `Bearer ${publisherAToken}`)
      .set('Idempotency-Key', `dist-${suffix}`)
      .send({
        libraryId,
        items: [{ editionId: edition.id, quantity: 3 }],
      })
      .expect(201);
    expect((replay.body as DistributionResponse).id).toBe(draft.id);

    const dispatched = await request(app.getHttpServer())
      .patch(`/api/v1/distributions/${draft.id}/dispatch`)
      .set('Authorization', `Bearer ${publisherAToken}`)
      .expect(200);

    expect((dispatched.body as DistributionResponse).status).toBe('DISPATCHED');

    const copies = await request(app.getHttpServer())
      .get('/api/v1/copies')
      .query({ editionId: edition.id, status: 'DISTRIBUTED', limit: 20 })
      .set('Authorization', `Bearer ${publisherAToken}`)
      .expect(200);
    expect(
      (copies.body as { data: Array<{ libraryId: string }> }).data,
    ).toHaveLength(3);

    const inventory = await request(app.getHttpServer())
      .get('/api/v1/inventory/summary')
      .query({ editionId: edition.id })
      .set('Authorization', `Bearer ${publisherAToken}`)
      .expect(200);
    expect(inventory.body).toMatchObject({
      warehouseOnHand: 3,
      inTransit: 3,
    });

    await request(app.getHttpServer())
      .get(`/api/v1/distributions/${draft.id}`)
      .set('Authorization', `Bearer ${libraryToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/distributions/${draft.id}/dispatch`)
      .set('Authorization', `Bearer ${libraryToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/v1/distributions')
      .set('Authorization', `Bearer ${publisherAToken}`)
      .send({
        libraryId,
        items: [{ editionId: edition.id, quantity: 99 }],
        dispatch: true,
      })
      .expect(400);

    await request(app.getHttpServer())
      .delete(`/api/v1/libraries/${libraryId}/link`)
      .set('Authorization', `Bearer ${publisherAToken}`)
      .expect(204);
  });

  it('records a library sale with idempotency and inventory updates', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/libraries/links')
      .set('Authorization', `Bearer ${publisherAToken}`)
      .send({ slug: `auth-lib-${suffix}` })
      .expect(201);

    const bookRes = await request(app.getHttpServer())
      .post('/api/v1/books')
      .set('Authorization', `Bearer ${publisherAToken}`)
      .send({
        title: 'E2E Sales Title',
        authors: 'Test Author',
      })
      .expect(201);
    const book = bookRes.body as BookResponse;

    const isbn = isbn13FromUnique(`${suffix.slice(-8)}2`);
    const editionRes = await request(app.getHttpServer())
      .post('/api/v1/editions')
      .set('Authorization', `Bearer ${publisherAToken}`)
      .send({
        bookId: book.id,
        isbn,
        format: 'HARDCOVER',
        listPriceCents: 1999,
      })
      .expect(201);
    const edition = editionRes.body as EditionResponse;

    await request(app.getHttpServer())
      .post('/api/v1/copies/bulk')
      .set('Authorization', `Bearer ${publisherAToken}`)
      .send({ editionId: edition.id, quantity: 3 })
      .expect(201);

    const distRes = await request(app.getHttpServer())
      .post('/api/v1/distributions')
      .set('Authorization', `Bearer ${publisherAToken}`)
      .set('Idempotency-Key', `sale-dist-${suffix}`)
      .send({
        libraryId,
        items: [{ editionId: edition.id, quantity: 2 }],
        dispatch: true,
      })
      .expect(201);
    const distribution = distRes.body as DistributionResponse;

    const distributedCopies = await prisma.bookCopy.findMany({
      where: {
        editionId: edition.id,
        libraryId,
        status: 'DISTRIBUTED',
      },
      orderBy: { copyNumber: 'asc' },
      select: { id: true },
    });
    expect(distributedCopies).toHaveLength(2);

    const receiptRes = await request(app.getHttpServer())
      .post('/api/v1/stock-receipts')
      .set('Authorization', `Bearer ${libraryToken}`)
      .set('Idempotency-Key', `recv-${suffix}`)
      .send({
        distributionId: distribution.id,
        confirm: true,
      })
      .expect(201);
    const receipt = receiptRes.body as StockReceiptResponse;
    expect(receipt.receivedCount).toBe(2);
    expect(receipt.status).toBe('CONFIRMED');

    const replayReceipt = await request(app.getHttpServer())
      .post('/api/v1/stock-receipts')
      .set('Authorization', `Bearer ${libraryToken}`)
      .set('Idempotency-Key', `recv-${suffix}`)
      .send({
        distributionId: distribution.id,
        confirm: true,
      })
      .expect(201);
    expect((replayReceipt.body as StockReceiptResponse).id).toBe(receipt.id);

    await request(app.getHttpServer())
      .get(`/api/v1/distributions/${distribution.id}`)
      .set('Authorization', `Bearer ${publisherAToken}`)
      .expect(200)
      .expect((res) => {
        expect((res.body as DistributionResponse).status).toBe('RECEIVED');
      });

    const created = await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${libraryToken}`)
      .set('Idempotency-Key', `sale-${suffix}`)
      .send({
        items: [{ copyId: distributedCopies[0].id }],
      })
      .expect(201);

    const sale = created.body as SaleResponse;
    expect(sale.libraryId).toBe(libraryId);
    expect(sale.itemCount).toBe(1);
    expect(sale.totalCents).toBe(1999);
    expect(sale.items[0].copyId).toBe(distributedCopies[0].id);

    const replay = await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${libraryToken}`)
      .set('Idempotency-Key', `sale-${suffix}`)
      .send({
        items: [{ copyId: distributedCopies[0].id }],
      })
      .expect(201);
    expect((replay.body as SaleResponse).id).toBe(sale.id);

    await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${libraryToken}`)
      .set('Idempotency-Key', `sale-again-${suffix}`)
      .send({
        items: [{ copyId: distributedCopies[0].id }],
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${publisherAToken}`)
      .set('Idempotency-Key', `sale-pub-${suffix}`)
      .send({
        items: [{ copyId: distributedCopies[1].id }],
      })
      .expect(403);

    const listed = await request(app.getHttpServer())
      .get('/api/v1/sales')
      .query({ editionId: edition.id })
      .set('Authorization', `Bearer ${publisherAToken}`)
      .expect(200);
    expect((listed.body as { data: SaleResponse[] }).data).toHaveLength(1);

    await request(app.getHttpServer())
      .get(`/api/v1/sales/${sale.id}`)
      .set('Authorization', `Bearer ${publisherAToken}`)
      .expect(200);

    const inventory = await request(app.getHttpServer())
      .get('/api/v1/inventory/summary')
      .query({ editionId: edition.id })
      .set('Authorization', `Bearer ${libraryToken}`)
      .expect(200);
    expect(inventory.body).toMatchObject({
      libraryOnHand: 1,
      sold: 1,
    });

    const analytics = await request(app.getHttpServer())
      .get('/api/v1/analytics/overview')
      .query({ period: 'all' })
      .set('Authorization', `Bearer ${publisherAToken}`)
      .expect(200);
    expect(analytics.body).toMatchObject({
      publisherId: publisherAId,
      source: 'live',
      kpis: {
        sold: 1,
        distributed: 1,
      },
    });
    expect(
      (analytics.body as { topBooks: Array<{ editionId: string }> }).topBooks[0]
        ?.editionId,
    ).toBe(edition.id);
    expect(
      (
        analytics.body as {
          libraries: Array<{ libraryId: string; sold: number }>;
        }
      ).libraries,
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ libraryId, sold: 1 })]),
    );

    await request(app.getHttpServer())
      .get(`/api/v1/stock-receipts/${receipt.id}`)
      .set('Authorization', `Bearer ${publisherAToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/api/v1/libraries/${libraryId}/link`)
      .set('Authorization', `Bearer ${publisherAToken}`)
      .expect(204);
  });

  it('receives a dispatched shipment with partial discrepancy flagging', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/libraries/links')
      .set('Authorization', `Bearer ${publisherAToken}`)
      .send({ slug: `auth-lib-${suffix}` })
      .expect(201);

    const bookRes = await request(app.getHttpServer())
      .post('/api/v1/books')
      .set('Authorization', `Bearer ${publisherAToken}`)
      .send({
        title: 'E2E Receiving Title',
        authors: 'Test Author',
      })
      .expect(201);
    const book = bookRes.body as BookResponse;

    const isbn = isbn13FromUnique(`${suffix.slice(-8)}3`);
    const editionRes = await request(app.getHttpServer())
      .post('/api/v1/editions')
      .set('Authorization', `Bearer ${publisherAToken}`)
      .send({
        bookId: book.id,
        isbn,
        format: 'PAPERBACK',
        listPriceCents: 1299,
      })
      .expect(201);
    const edition = editionRes.body as EditionResponse;

    await request(app.getHttpServer())
      .post('/api/v1/copies/bulk')
      .set('Authorization', `Bearer ${publisherAToken}`)
      .send({ editionId: edition.id, quantity: 3 })
      .expect(201);

    const distRes = await request(app.getHttpServer())
      .post('/api/v1/distributions')
      .set('Authorization', `Bearer ${publisherAToken}`)
      .set('Idempotency-Key', `recv-dist-${suffix}`)
      .send({
        libraryId,
        items: [{ editionId: edition.id, quantity: 3 }],
        dispatch: true,
      })
      .expect(201);
    const distribution = distRes.body as DistributionResponse;

    const copies = await prisma.bookCopy.findMany({
      where: {
        editionId: edition.id,
        libraryId,
        status: 'DISTRIBUTED',
      },
      orderBy: { copyNumber: 'asc' },
      select: { id: true },
    });
    expect(copies).toHaveLength(3);

    await request(app.getHttpServer())
      .post('/api/v1/stock-receipts')
      .set('Authorization', `Bearer ${publisherAToken}`)
      .set('Idempotency-Key', `recv-pub-${suffix}`)
      .send({
        distributionId: distribution.id,
        confirm: true,
      })
      .expect(403);

    const created = await request(app.getHttpServer())
      .post('/api/v1/stock-receipts')
      .set('Authorization', `Bearer ${libraryToken}`)
      .set('Idempotency-Key', `recv-partial-${suffix}`)
      .send({
        distributionId: distribution.id,
        confirm: true,
        items: [
          { copyId: copies[0].id, received: true },
          { copyId: copies[1].id, received: true },
          {
            copyId: copies[2].id,
            received: false,
            discrepancy: 'MISSING',
          },
        ],
      })
      .expect(201);

    const receipt = created.body as StockReceiptResponse;
    expect(receipt.receivedCount).toBe(2);
    expect(receipt.discrepancyCount).toBe(1);
    expect(receipt.status).toBe('CONFIRMED');

    const shipment = await request(app.getHttpServer())
      .get(`/api/v1/distributions/${distribution.id}`)
      .set('Authorization', `Bearer ${libraryToken}`)
      .expect(200);
    expect((shipment.body as DistributionResponse).status).toBe(
      'PARTIALLY_RECEIVED',
    );

    const inbound = await request(app.getHttpServer())
      .get('/api/v1/distributions')
      .query({ receivable: true })
      .set('Authorization', `Bearer ${libraryToken}`)
      .expect(200);
    expect(
      (inbound.body as { data: DistributionResponse[] }).data.some(
        (row) => row.id === distribution.id,
      ),
    ).toBe(true);

    const inventory = await request(app.getHttpServer())
      .get('/api/v1/inventory/summary')
      .query({ editionId: edition.id })
      .set('Authorization', `Bearer ${libraryToken}`)
      .expect(200);
    expect(inventory.body).toMatchObject({
      libraryOnHand: 2,
      inTransit: 1,
    });

    await request(app.getHttpServer())
      .delete(`/api/v1/libraries/${libraryId}/link`)
      .set('Authorization', `Bearer ${publisherAToken}`)
      .expect(204);
  });

  it('logs out and rejects the previous refresh token', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: `pa-${suffix}@pubtrack.test`,
        password: 'ChangeMe123!',
      })
      .expect(200);
    const tokens = loginRes.body as AuthResponse;

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ refreshToken: tokens.refreshToken })
      .expect(204);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(401);
  });
});
