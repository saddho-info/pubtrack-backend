import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsService } from './notifications.service';

const redisUrl = process.env.REDIS_URL?.trim();

const queueImports = redisUrl
  ? [BullModule.registerQueue({ name: 'notifications' })]
  : [];

const queueProviders = redisUrl
  ? [NotificationsProcessor]
  : [
      {
        provide: 'BullQueue_notifications',
        useValue: {
          add: async () => ({ id: 'notifications-disabled' }),
        },
      },
    ];

@Module({
  imports: queueImports,
  controllers: [NotificationsController],
  providers: [NotificationsService, ...queueProviders],
  exports: [NotificationsService],
})
export class NotificationsModule {}
