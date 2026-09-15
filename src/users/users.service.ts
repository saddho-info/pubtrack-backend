import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '../../generated/prisma/client';
import { paginatedMeta } from '../common/dto/pagination.dto';
import type { PaginationQueryDto } from '../common/dto/pagination.dto';
import {
  AuthUser,
  isLibraryRole,
  isPublisherRole,
} from '../common/types/auth-user';
import { hashPassword } from '../common/utils/password';
import { toPublicUser } from '../common/utils/public-user';
import {
  assertCanAssignRole,
  userScopeWhere,
} from '../common/utils/scoped-where';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto, actor: AuthUser) {
    const publisherId =
      dto.publisherId ??
      (isPublisherRole(dto.role) && isPublisherRole(actor.role)
        ? (actor.publisherId ?? undefined)
        : undefined);
    const libraryId =
      dto.libraryId ??
      (isLibraryRole(dto.role) && isLibraryRole(actor.role)
        ? (actor.libraryId ?? undefined)
        : undefined);
    this.validateOrgForRole(dto.role, publisherId, libraryId);
    assertCanAssignRole(actor, dto.role, publisherId, libraryId);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash: await hashPassword(dto.password),
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role,
        publisherId: publisherId ?? null,
        libraryId: libraryId ?? null,
        isActive: dto.isActive ?? true,
      },
    });

    return toPublicUser(user);
  }

  async findAll(query: PaginationQueryDto, actor: AuthUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.UserWhereInput = {
      ...userScopeWhere(actor),
      ...this.buildSearch(query),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: data.map(toPublicUser),
      meta: paginatedMeta(page, limit, total),
    };
  }

  async findOne(id: string, actor: AuthUser) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    this.assertCanRead(actor, user.publisherId, user.libraryId, user.id);
    return toPublicUser(user);
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthUser) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`User ${id} not found`);
    }

    const isSelf = actor.id === id;
    const canAdmin = this.canManageOrg(
      actor,
      existing.publisherId,
      existing.libraryId,
    );

    if (!isSelf && !canAdmin) {
      throw new ForbiddenException('Cannot update this user');
    }

    if (!canAdmin) {
      if (
        dto.role ||
        dto.publisherId ||
        dto.libraryId ||
        dto.isActive !== undefined
      ) {
        throw new ForbiddenException('Cannot change role or organization');
      }
    }

    const nextRole = dto.role ?? existing.role;
    const nextPublisherId =
      dto.publisherId === undefined ? existing.publisherId : dto.publisherId;
    const nextLibraryId =
      dto.libraryId === undefined ? existing.libraryId : dto.libraryId;

    this.validateOrgForRole(nextRole, nextPublisherId, nextLibraryId);

    if (
      dto.role ||
      dto.publisherId !== undefined ||
      dto.libraryId !== undefined
    ) {
      assertCanAssignRole(actor, nextRole, nextPublisherId, nextLibraryId);
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        email: dto.email?.toLowerCase(),
        passwordHash: dto.password
          ? await hashPassword(dto.password)
          : undefined,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role,
        publisherId: dto.publisherId,
        libraryId: dto.libraryId,
        isActive: dto.isActive,
      },
    });

    return toPublicUser(user);
  }

  private buildSearch(query: PaginationQueryDto): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = {};
    if (query.search) {
      where.OR = [
        { email: { contains: query.search, mode: 'insensitive' } },
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }
    return where;
  }

  private validateOrgForRole(
    role: Role,
    publisherId?: string | null,
    libraryId?: string | null,
  ): void {
    if (role === Role.SUPER_ADMIN) {
      if (publisherId || libraryId) {
        throw new BadRequestException(
          'SUPER_ADMIN must not belong to a publisher or library',
        );
      }
      return;
    }
    if (isPublisherRole(role)) {
      if (!publisherId) {
        throw new BadRequestException(
          'publisherId is required for publisher roles',
        );
      }
      if (libraryId) {
        throw new BadRequestException(
          'Publisher users must not have a libraryId',
        );
      }
      return;
    }
    if (isLibraryRole(role)) {
      if (!libraryId) {
        throw new BadRequestException(
          'libraryId is required for library roles',
        );
      }
      if (publisherId) {
        throw new BadRequestException(
          'Library users must not have a publisherId',
        );
      }
    }
  }

  private canManageOrg(
    actor: AuthUser,
    publisherId: string | null,
    libraryId: string | null,
  ): boolean {
    if (actor.role === Role.SUPER_ADMIN) {
      return true;
    }
    if (
      actor.role === Role.PUBLISHER_ADMIN &&
      publisherId &&
      publisherId === actor.publisherId
    ) {
      return true;
    }
    if (
      actor.role === Role.LIBRARY_ADMIN &&
      libraryId &&
      libraryId === actor.libraryId
    ) {
      return true;
    }
    return false;
  }

  private assertCanRead(
    actor: AuthUser,
    publisherId: string | null,
    libraryId: string | null,
    userId: string,
  ): void {
    if (actor.id === userId || actor.role === Role.SUPER_ADMIN) {
      return;
    }
    if (
      isPublisherRole(actor.role) &&
      publisherId &&
      publisherId === actor.publisherId
    ) {
      return;
    }
    if (
      isLibraryRole(actor.role) &&
      libraryId &&
      libraryId === actor.libraryId
    ) {
      return;
    }
    throw new ForbiddenException('Cannot access this user');
  }
}
