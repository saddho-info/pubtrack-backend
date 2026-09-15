import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { paginatedMeta } from '../common/dto/pagination.dto';
import type { AuthUser } from '../common/types/auth-user';
import {
  assertPublisherAccess,
  bookScopeWhere,
  resolveOwnedPublisherId,
} from '../common/utils/scoped-where';
import { slugifyOrFallback } from '../common/utils/slugify';
import { PrismaService } from '../prisma/prisma.service';
import { BookQueryDto } from './dto/book-query.dto';
import { CreateBookDto } from './dto/create-book.dto';
import { UpdateBookDto } from './dto/update-book.dto';

const bookListInclude = {
  publisher: { select: { id: true, name: true, slug: true } },
  _count: { select: { editions: true } },
} satisfies Prisma.BookInclude;

const bookDetailInclude = {
  publisher: { select: { id: true, name: true, slug: true } },
  editions: { orderBy: { createdAt: 'desc' } },
  _count: { select: { editions: true } },
} satisfies Prisma.BookInclude;

@Injectable()
export class BooksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateBookDto, user: AuthUser) {
    const publisherId = resolveOwnedPublisherId(user, dto.publisherId);
    await this.assertPublisherExists(publisherId);

    const baseSlug = dto.slug ?? slugifyOrFallback(dto.title, 'book');
    const slug = await this.uniqueSlug(publisherId, baseSlug);

    return this.prisma.book.create({
      data: {
        publisherId,
        title: dto.title,
        subtitle: dto.subtitle,
        authors: dto.authors,
        description: dto.description,
        language: dto.language ?? 'en',
        category: dto.category,
        coverImageUrl: dto.coverImageUrl,
        slug,
        isActive: dto.isActive ?? true,
      },
      include: bookDetailInclude,
    });
  }

  async findAll(query: BookQueryDto, user: AuthUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.BookWhereInput = {
      ...bookScopeWhere(user),
      ...this.buildWhere(query, user),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.book.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: bookListInclude,
      }),
      this.prisma.book.count({ where }),
    ]);

    return { data, meta: paginatedMeta(page, limit, total) };
  }

  async findOne(id: string, user: AuthUser) {
    const book = await this.prisma.book.findUnique({
      where: { id },
      include: bookDetailInclude,
    });

    if (!book) {
      throw new NotFoundException(`Book ${id} not found`);
    }

    assertPublisherAccess(user, book.publisherId);
    return book;
  }

  async update(id: string, dto: UpdateBookDto, user: AuthUser) {
    const existing = await this.findOne(id, user);

    if (dto.publisherId && dto.publisherId !== existing.publisherId) {
      throw new BadRequestException('Cannot move a book to another publisher');
    }

    let slug = dto.slug;
    if (slug && slug !== existing.slug) {
      slug = await this.uniqueSlug(existing.publisherId, slug, existing.id);
    }

    return this.prisma.book.update({
      where: { id },
      data: {
        title: dto.title,
        subtitle: dto.subtitle,
        authors: dto.authors,
        description: dto.description,
        language: dto.language,
        category: dto.category,
        coverImageUrl: dto.coverImageUrl,
        slug,
        isActive: dto.isActive,
      },
      include: bookDetailInclude,
    });
  }

  private buildWhere(
    query: BookQueryDto,
    user: AuthUser,
  ): Prisma.BookWhereInput {
    const where: Prisma.BookWhereInput = {};

    if (query.publisherId) {
      assertPublisherAccess(user, query.publisherId);
      where.publisherId = query.publisherId;
    }

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { subtitle: { contains: query.search, mode: 'insensitive' } },
        { authors: { contains: query.search, mode: 'insensitive' } },
        { slug: { contains: query.search, mode: 'insensitive' } },
        { category: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    return where;
  }

  private async assertPublisherExists(publisherId: string) {
    const publisher = await this.prisma.publisher.findUnique({
      where: { id: publisherId },
      select: { id: true },
    });
    if (!publisher) {
      throw new NotFoundException(`Publisher ${publisherId} not found`);
    }
  }

  private async uniqueSlug(
    publisherId: string,
    base: string,
    excludeId?: string,
  ): Promise<string> {
    let slug = base;
    let n = 2;

    while (
      await this.prisma.book.findFirst({
        where: {
          publisherId,
          slug,
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
        select: { id: true },
      })
    ) {
      slug = `${base.slice(0, 70)}-${n}`;
      n += 1;
    }

    return slug;
  }
}
