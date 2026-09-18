import { Test, TestingModule } from '@nestjs/testing';
import {
  libraryAdminUser,
  publisherAdminUser,
  superAdminUser,
} from '../common/testing/auth-user.fixture';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;

  const notificationQueue = { add: jest.fn() };
  const prisma = {
    notification: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    deviceToken: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      async (ops: Promise<unknown>[]) => Promise.all(ops),
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: 'BullQueue_notifications', useValue: notificationQueue },
      ],
    }).compile();
    service = module.get(NotificationsService);
  });

  it('enqueues one sale-created job per publisher', async () => {
    notificationQueue.add.mockResolvedValue({ id: 'job_1' });

    await service.onSaleCreated({
      id: 'sale_1',
      code: 'S-1',
      libraryId: 'lib_1',
      totalCents: 1999,
      library: { name: 'Riverside' },
      items: [
        {
          edition: {
            book: { title: 'Silent Archive', publisherId: 'pub_1' },
          },
        },
        {
          edition: {
            book: { title: 'Second Title', publisherId: 'pub_1' },
          },
        },
        {
          edition: {
            book: { title: 'Other Pub Book', publisherId: 'pub_2' },
          },
        },
      ],
    });

    expect(notificationQueue.add).toHaveBeenCalledTimes(2);
    expect(notificationQueue.add).toHaveBeenCalledWith(
      'sale-created',
      expect.objectContaining({
        saleId: 'sale_1',
        publisherId: 'pub_1',
        titles: ['Silent Archive', 'Second Title'],
      }),
      expect.objectContaining({ jobId: 'sale-sale_1-pub_1' }),
    );
    expect(notificationQueue.add).toHaveBeenCalledWith(
      'sale-created',
      expect.objectContaining({ publisherId: 'pub_2' }),
      expect.objectContaining({ jobId: 'sale-sale_1-pub_2' }),
    );
  });

  it('scopes notification lists to the publisher tenant', async () => {
    prisma.notification.findMany.mockResolvedValue([]);
    prisma.notification.count.mockResolvedValue(0);

    await service.findAll({ page: 1, limit: 10 }, publisherAdminUser('pub_1'));

    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { publisherId: 'pub_1' },
      }),
    );
  });

  it('scopes library notification lists to library or user', async () => {
    prisma.notification.findMany.mockResolvedValue([]);
    prisma.notification.count.mockResolvedValue(0);

    await service.findAll({}, libraryAdminUser('lib_1'));

    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ libraryId: 'lib_1' }, { userId: 'user_la' }],
        },
      }),
    );
  });

  it('allows super admins an unscoped list', async () => {
    prisma.notification.findMany.mockResolvedValue([]);
    prisma.notification.count.mockResolvedValue(0);

    await service.findAll({ unreadOnly: true }, superAdminUser);

    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { readAt: null },
      }),
    );
  });

  it('marks an unread notification as read', async () => {
    prisma.notification.findFirst.mockResolvedValue({
      id: 'n1',
      readAt: null,
    });
    prisma.notification.update.mockResolvedValue({
      id: 'n1',
      readAt: new Date('2026-09-18'),
    });

    const result = await service.markRead('n1', publisherAdminUser('pub_1'));

    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'n1' },
      data: { readAt: expect.any(Date) },
    });
    expect(result?.id).toBe('n1');
  });

  it('registers and unregisters device tokens', async () => {
    prisma.deviceToken.upsert.mockResolvedValue({ token: 'tok' });
    prisma.deviceToken.deleteMany.mockResolvedValue({ count: 1 });

    await service.registerDevice(
      { token: 'tok', platform: 'ios' },
      publisherAdminUser('pub_1'),
    );
    await service.unregisterDevice('tok', publisherAdminUser('pub_1'));

    expect(prisma.deviceToken.upsert).toHaveBeenCalled();
    expect(prisma.deviceToken.deleteMany).toHaveBeenCalledWith({
      where: { token: 'tok', userId: 'user_pa' },
    });
  });
});
