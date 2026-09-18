import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotificationType } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsProcessor } from './notifications.processor';

describe('NotificationsProcessor', () => {
  let processor: NotificationsProcessor;

  const prisma = {
    notification: {
      upsert: jest.fn(),
    },
    deviceToken: {
      findMany: jest.fn(),
    },
  };
  const config = {
    get: jest.fn().mockReturnValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsProcessor,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    processor = module.get(NotificationsProcessor);
  });

  it('persists an authoritative SALE_CREATED notification row', async () => {
    prisma.notification.upsert.mockResolvedValue({ id: 'n1' });
    prisma.deviceToken.findMany.mockResolvedValue([]);

    const id = await processor.process({
      name: 'sale-created',
      data: {
        saleId: 'sale_1',
        code: 'S-100',
        libraryId: 'lib_1',
        libraryName: 'Riverside',
        publisherId: 'pub_1',
        totalCents: 1999,
        titles: ['Silent Archive'],
      },
    } as never);

    expect(id).toBe('n1');
    expect(prisma.notification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sourceKey: 'sale:sale_1:publisher:pub_1' },
        create: expect.objectContaining({
          type: NotificationType.SALE_CREATED,
          title: 'Sale S-100',
          body: 'Riverside sold Silent Archive.',
          publisherId: 'pub_1',
          libraryId: 'lib_1',
        }),
      }),
    );
  });
});
