import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { Role } from '../generated/prisma/client';
import { hashPassword } from './../src/common/utils/password';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from './../src/prisma/prisma.service';
import { NotificationsProcessor } from './../src/notifications/notifications.processor';

type AuthResponse = {
  accessToken: string;
};

type BookResponse = { id: string };
type EditionResponse = { id: string; listPriceCents: number };
type DistributionResponse = { id: string };
type SaleResponse = {
  id: string;
  code: string;
  libraryId: string;
  totalCents: number;
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

describe('Offline sync and MVP flow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let processor: NotificationsProcessor;
  let publisherId: string;
  let libraryId: string;
  let publisherToken: string;
  let libraryToken: string;
  const suffix = `sync-${Date.now()}`;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    processor = app.get(NotificationsProcessor);

    try {
      await prisma.syncTransaction.findFirst();
    } catch {
      await app.close();
      throw new Error(
        'SyncTransaction table is missing. Run `npx prisma migrate deploy` before e2e sync tests.',
      );
    }

    const publisher = await prisma.publisher.create({
      data: { name: 'Sync Press', slug: `sync-press-${suffix}` },
    });
    const library = await prisma.library.create({
      data: { name: 'Sync Library', slug: `sync-lib-${suffix}` },
    });
    publisherId = publisher.id;
    libraryId = library.id;

    const passwordHash = await hashPassword('ChangeMe123!');
    await prisma.user.createMany({
      data: [
        {
          email: `pa-${suffix}@pubtrack.test`,
          passwordHash,
          firstName: 'Pub',
          lastName: 'Admin',
          role: Role.PUBLISHER_ADMIN,
          publisherId,
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

    const publisherLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: `pa-${suffix}@pubtrack.test`,
        password: 'ChangeMe123!',
      })
      .expect(200);
    publisherToken = (publisherLogin.body as AuthResponse).accessToken;

    const libraryLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: `la-${suffix}@pubtrack.test`,
        password: 'ChangeMe123!',
      })
      .expect(200);
    libraryToken = (libraryLogin.body as AuthResponse).accessToken;

    await request(app.getHttpServer())
      .post('/api/v1/libraries/links')
      .set('Authorization', `Bearer ${publisherToken}`)
      .send({ slug: `sync-lib-${suffix}` })
      .expect(201);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('runs book → distribute → receive → offline sync sale → inventory → notification', async () => {
    const bookRes = await request(app.getHttpServer())
      .post('/api/v1/books')
      .set('Authorization', `Bearer ${publisherToken}`)
      .send({
        title: 'Sync Flow Title',
        authors: 'Sync Author',
      })
      .expect(201);
    const book = bookRes.body as BookResponse;

    const isbn = isbn13FromUnique(`${suffix.replace(/\D/g, '').slice(-8)}1`);
    const editionRes = await request(app.getHttpServer())
      .post('/api/v1/editions')
      .set('Authorization', `Bearer ${publisherToken}`)
      .send({
        bookId: book.id,
        isbn,
        format: 'HARDCOVER',
        listPriceCents: 2499,
      })
      .expect(201);
    const edition = editionRes.body as EditionResponse;

    await request(app.getHttpServer())
      .post('/api/v1/copies/bulk')
      .set('Authorization', `Bearer ${publisherToken}`)
      .send({ editionId: edition.id, quantity: 2 })
      .expect(201);

    const distRes = await request(app.getHttpServer())
      .post('/api/v1/distributions')
      .set('Authorization', `Bearer ${publisherToken}`)
      .set('Idempotency-Key', `sync-dist-${suffix}`)
      .send({
        libraryId,
        items: [{ editionId: edition.id, quantity: 2 }],
        dispatch: true,
      })
      .expect(201);
    const distribution = distRes.body as DistributionResponse;

    await request(app.getHttpServer())
      .post('/api/v1/stock-receipts')
      .set('Authorization', `Bearer ${libraryToken}`)
      .set('Idempotency-Key', `sync-recv-${suffix}`)
      .send({
        distributionId: distribution.id,
        confirm: true,
      })
      .expect(201);

    const copies = await prisma.bookCopy.findMany({
      where: {
        editionId: edition.id,
        libraryId,
        status: 'IN_STOCK_LIBRARY',
      },
      orderBy: { copyNumber: 'asc' },
      select: { id: true },
    });
    expect(copies).toHaveLength(2);

    const clientId = `offline-sale-${suffix}`;
    const syncRes = await request(app.getHttpServer())
      .post('/api/v1/sync/batch')
      .set('Authorization', `Bearer ${libraryToken}`)
      .send({
        transactions: [
          {
            clientId,
            type: 'SALE',
            payload: {
              libraryId,
              items: [{ copyId: copies[0].id }],
            },
          },
        ],
      })
      .expect(201);

    const first = (
      syncRes.body as {
        results: Array<{
          clientId: string;
          status: string;
          entity?: SaleResponse;
        }>;
      }
    ).results[0];
    expect(first.status).toBe('APPLIED');
    expect(first.entity?.libraryId).toBe(libraryId);
    expect(first.entity?.totalCents).toBe(2499);

    const replay = await request(app.getHttpServer())
      .post('/api/v1/sync/batch')
      .set('Authorization', `Bearer ${libraryToken}`)
      .send({
        transactions: [
          {
            clientId,
            type: 'SALE',
            payload: {
              libraryId,
              items: [{ copyId: copies[0].id }],
            },
          },
        ],
      })
      .expect(201);
    expect(
      (
        replay.body as {
          results: Array<{ status: string; reason?: string }>;
        }
      ).results[0],
    ).toMatchObject({ status: 'DUPLICATE', reason: 'DUPLICATE' });

    const inventory = await request(app.getHttpServer())
      .get('/api/v1/inventory/summary')
      .query({ editionId: edition.id })
      .set('Authorization', `Bearer ${libraryToken}`)
      .expect(200);
    expect(inventory.body).toMatchObject({
      libraryOnHand: 1,
      sold: 1,
    });

    const listed = await request(app.getHttpServer())
      .get('/api/v1/sales')
      .query({ editionId: edition.id })
      .set('Authorization', `Bearer ${publisherToken}`)
      .expect(200);
    expect((listed.body as { data: SaleResponse[] }).data).toHaveLength(1);

    const sale = first.entity as SaleResponse;
    await processor.process({
      name: 'sale-created',
      data: {
        saleId: sale.id,
        code: sale.code,
        libraryId,
        libraryName: 'Sync Library',
        publisherId,
        totalCents: sale.totalCents,
        titles: ['Sync Flow Title'],
      },
    } as never);

    const notifications = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${publisherToken}`)
      .expect(200);
    expect(
      (notifications.body as { data: Array<{ title: string }> }).data.some(
        (row) => row.title.includes(sale.code),
      ),
    ).toBe(true);

    const rejected = await request(app.getHttpServer())
      .post('/api/v1/sync/batch')
      .set('Authorization', `Bearer ${libraryToken}`)
      .send({
        transactions: [
          {
            clientId: `offline-sold-again-${suffix}`,
            type: 'SALE',
            payload: {
              libraryId,
              items: [{ copyId: copies[0].id }],
            },
          },
        ],
      })
      .expect(201);
    expect(
      (
        rejected.body as {
          results: Array<{ status: string; reason?: string }>;
        }
      ).results[0],
    ).toMatchObject({ status: 'REJECTED', reason: 'ALREADY_SOLD' });
  });

  it('rejects publisher sync attempts', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/sync/batch')
      .set('Authorization', `Bearer ${publisherToken}`)
      .send({
        transactions: [
          {
            clientId: `pub-sync-${suffix}`,
            type: 'SALE',
            payload: { items: [] },
          },
        ],
      })
      .expect(403);
  });
});
