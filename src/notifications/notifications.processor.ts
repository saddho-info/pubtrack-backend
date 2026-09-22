import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import { NotificationType, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type SaleCreatedJob = {
  saleId: string;
  code: string;
  libraryId: string;
  libraryName: string;
  publisherId: string;
  totalCents: number;
  titles: string[];
};

@Injectable()
@Processor('notifications')
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async process(job: Job<SaleCreatedJob>) {
    if (job.name !== 'sale-created') {
      this.logger.warn(`Ignoring unknown notification job ${job.name}`);
      return;
    }

    const data = job.data;
    const itemCount = data.titles.length;
    const title = `Sale ${data.code}`;
    const firstTitle = data.titles[0] ?? 'a title';
    const suffix = itemCount > 1 ? ` and ${itemCount - 1} more` : '';
    const body = `${data.libraryName} sold ${firstTitle}${suffix}.`;

    const notification = await this.prisma.notification.upsert({
      where: {
        sourceKey: `sale:${data.saleId}:publisher:${data.publisherId}`,
      },
      update: {},
      create: {
        sourceKey: `sale:${data.saleId}:publisher:${data.publisherId}`,
        type: NotificationType.SALE_CREATED,
        title,
        body,
        publisherId: data.publisherId,
        libraryId: data.libraryId,
        payload: {
          saleId: data.saleId,
          code: data.code,
          totalCents: data.totalCents,
        } as Prisma.InputJsonValue,
      },
    });

    await this.sendPush(notification.id, data.publisherId, title, body);
    return notification.id;
  }

  private async sendPush(
    notificationId: string,
    publisherId: string,
    title: string,
    body: string,
  ) {
    const devices = await this.prisma.deviceToken.findMany({
      where: { user: { publisherId, isActive: true } },
      select: { id: true, token: true },
    });
    if (devices.length === 0) return;

    const credentials = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT');
    if (!credentials) {
      this.logger.debug('FCM disabled: FIREBASE_SERVICE_ACCOUNT is not set');
      return;
    }

    const [{ cert, getApps, initializeApp }, { getMessaging }] =
      await Promise.all([
        import('firebase-admin/app'),
        import('firebase-admin/messaging'),
      ]);
    if (getApps().length === 0) {
      initializeApp({
        credential: cert(JSON.parse(credentials) as Parameters<typeof cert>[0]),
      });
    }

    const response = await getMessaging().sendEachForMulticast({
      tokens: devices.map((device) => device.token),
      notification: { title, body },
      data: { notificationId, type: NotificationType.SALE_CREATED },
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default' } } },
    });

    const invalidIds = response.responses.flatMap((result, index) => {
      if (result.success) return [];
      const code = result.error?.code ?? '';
      return code.includes('registration-token-not-registered') ||
        code.includes('invalid-registration-token')
        ? [devices[index].id]
        : [];
    });
    if (invalidIds.length > 0) {
      await this.prisma.deviceToken.deleteMany({
        where: { id: { in: invalidIds } },
      });
    }
    if (response.failureCount > invalidIds.length) {
      throw new Error(
        `FCM failed for ${response.failureCount} of ${devices.length} devices`,
      );
    }
  }
}
