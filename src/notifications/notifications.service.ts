import { Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { Prisma } from '../../generated/prisma/client';
import { paginatedMeta } from '../common/dto/pagination.dto';
import {
  AuthUser,
  isLibraryRole,
  isPublisherRole,
  isSuperAdmin,
} from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { RegisterDeviceDto } from './dto/register-device.dto';

type SaleLike = {
  id: string;
  code: string;
  libraryId: string;
  totalCents: number;
  library?: { name: string };
  items: Array<{
    edition: {
      book: { title: string; publisherId: string };
    };
  }>;
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('BullQueue_notifications')
    private readonly notificationQueue: Queue,
  ) {}

  async onSaleCreated(sale: SaleLike) {
    const publisherItems = new Map<string, string[]>();
    for (const item of sale.items) {
      const { publisherId, title } = item.edition.book;
      publisherItems.set(publisherId, [
        ...(publisherItems.get(publisherId) ?? []),
        title,
      ]);
    }

    return Promise.all(
      [...publisherItems.entries()].map(([publisherId, titles]) =>
        this.notificationQueue.add(
          'sale-created',
          {
            saleId: sale.id,
            code: sale.code,
            libraryId: sale.libraryId,
            libraryName: sale.library?.name ?? 'A library',
            publisherId,
            totalCents: sale.totalCents,
            titles,
          },
          {
            jobId: `sale-${sale.id}-${publisherId}`,
            attempts: 5,
            backoff: { type: 'exponential', delay: 1_000 },
            removeOnComplete: 500,
            removeOnFail: 1_000,
          },
        ),
      ),
    );
  }

  async findAll(query: NotificationQueryDto, user: AuthUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.scopeWhere(user);
    if (query.unreadOnly) {
      where.readAt = null;
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      data: rows,
      meta: paginatedMeta(page, limit, total),
    };
  }

  async markRead(id: string, user: AuthUser) {
    const existing = await this.prisma.notification.findFirst({
      where: { id, ...this.scopeWhere(user) },
    });
    if (!existing) {
      return null;
    }
    if (existing.readAt) {
      return existing;
    }
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async registerDevice(dto: RegisterDeviceDto, user: AuthUser) {
    return this.prisma.deviceToken.upsert({
      where: { token: dto.token },
      update: { userId: user.id, platform: dto.platform },
      create: {
        userId: user.id,
        token: dto.token,
        platform: dto.platform,
      },
    });
  }

  async unregisterDevice(token: string, user: AuthUser) {
    return this.prisma.deviceToken.deleteMany({
      where: { token, userId: user.id },
    });
  }

  private scopeWhere(user: AuthUser): Prisma.NotificationWhereInput {
    if (isSuperAdmin(user.role)) {
      return {};
    }
    if (isPublisherRole(user.role) && user.publisherId) {
      return { publisherId: user.publisherId };
    }
    if (isLibraryRole(user.role) && user.libraryId) {
      return {
        OR: [{ libraryId: user.libraryId }, { userId: user.id }],
      };
    }
    return { userId: user.id };
  }
}
