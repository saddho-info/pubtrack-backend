import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { paginatedMeta } from '../common/dto/pagination.dto';
import {
  AuthUser,
  isLibraryRole,
  isPublisherRole,
  isSuperAdmin,
} from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

export type AuditWriteInput = {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  method: string;
  path: string;
  statusCode?: number;
  metadata?: Prisma.InputJsonValue;
  ip?: string | null;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async write(input: AuditWriteInput) {
    return this.prisma.auditLog.create({
      data: {
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        method: input.method,
        path: input.path,
        statusCode: input.statusCode,
        metadata: input.metadata ?? Prisma.JsonNull,
        ip: input.ip ?? null,
      },
    });
  }

  async findAll(query: AuditLogQueryDto, user: AuthUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildWhere(query, user);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          actor: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
            },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: rows,
      meta: paginatedMeta(page, limit, total),
    };
  }

  private buildWhere(
    query: AuditLogQueryDto,
    user: AuthUser,
  ): Prisma.AuditLogWhereInput {
    const where: Prisma.AuditLogWhereInput = {};
    if (query.entityType) {
      where.entityType = query.entityType;
    }
    if (query.entityId) {
      where.entityId = query.entityId;
    }
    if (query.action) {
      where.action = { contains: query.action, mode: 'insensitive' };
    }
    if (query.search) {
      where.OR = [
        { path: { contains: query.search, mode: 'insensitive' } },
        { action: { contains: query.search, mode: 'insensitive' } },
        { entityId: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (isSuperAdmin(user.role)) {
      return where;
    }

    if (isPublisherRole(user.role) && user.publisherId) {
      where.actor = { publisherId: user.publisherId };
      return where;
    }

    if (isLibraryRole(user.role) && user.libraryId) {
      where.actor = { libraryId: user.libraryId };
      return where;
    }

    where.id = { in: [] };
    return where;
  }
}
