import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { paginatedMeta } from '../common/dto/pagination.dto';
import type { PaginationQueryDto } from '../common/dto/pagination.dto';
import { AuthUser, isLibraryRole } from '../common/types/auth-user';
import { slugifyOrFallback } from '../common/utils/slugify';
import {
  assertPublisherAccess,
  publisherScopeWhere,
} from '../common/utils/scoped-where';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePublisherDto } from './dto/create-publisher.dto';
import { UpdatePublisherDto } from './dto/update-publisher.dto';

const publisherInclude = {
  _count: { select: { users: true } },
} satisfies Prisma.PublisherInclude;

@Injectable()
export class PublishersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePublisherDto) {
    const slug = dto.slug ?? slugifyOrFallback(dto.name, 'publisher');

    return this.prisma.publisher.create({
      data: {
        name: dto.name,
        slug,
        email: dto.email,
        phone: dto.phone,
        address: dto.address,
        isActive: dto.isActive ?? true,
      },
      include: publisherInclude,
    });
  }

  async findAll(query: PaginationQueryDto, user: AuthUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.PublisherWhereInput = {
      ...this.buildWhere(query),
      ...publisherScopeWhere(user),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.publisher.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: publisherInclude,
      }),
      this.prisma.publisher.count({ where }),
    ]);

    return { data, meta: paginatedMeta(page, limit, total) };
  }

  async findOne(id: string, user: AuthUser) {
    const publisher = await this.prisma.publisher.findUnique({
      where: { id },
      include: publisherInclude,
    });

    if (!publisher) {
      throw new NotFoundException(`Publisher ${id} not found`);
    }

    // An unlinked publisher is indistinguishable from a missing one for a
    // library caller, so 404 rather than leak its existence.
    if (isLibraryRole(user.role) && user.libraryId) {
      const link = await this.prisma.publisherLibrary.findUnique({
        where: {
          publisherId_libraryId: {
            publisherId: publisher.id,
            libraryId: user.libraryId,
          },
        },
        select: { isActive: true },
      });
      if (!link?.isActive) {
        throw new NotFoundException(`Publisher ${id} not found`);
      }
      return publisher;
    }

    assertPublisherAccess(user, publisher.id);
    return publisher;
  }

  async update(id: string, dto: UpdatePublisherDto, user: AuthUser) {
    await this.findOne(id, user);

    return this.prisma.publisher.update({
      where: { id },
      data: {
        name: dto.name,
        slug: dto.slug,
        email: dto.email,
        phone: dto.phone,
        address: dto.address,
        isActive: dto.isActive,
      },
      include: publisherInclude,
    });
  }

  private buildWhere(query: PaginationQueryDto): Prisma.PublisherWhereInput {
    const where: Prisma.PublisherWhereInput = {};

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { slug: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    return where;
  }
}
