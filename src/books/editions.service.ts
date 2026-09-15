import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { paginatedMeta } from '../common/dto/pagination.dto';
import type { AuthUser } from '../common/types/auth-user';
import {
  isValidIsbn10,
  isValidIsbn13,
  normalizeIsbn,
} from '../common/utils/isbn';
import {
  assertPublisherAccess,
  editionScopeWhere,
} from '../common/utils/scoped-where';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEditionDto } from './dto/create-edition.dto';
import { EditionQueryDto } from './dto/edition-query.dto';
import { UpdateEditionDto } from './dto/update-edition.dto';

const editionInclude = {
  book: {
    select: {
      id: true,
      title: true,
      authors: true,
      publisherId: true,
      slug: true,
      publisher: { select: { id: true, name: true, slug: true } },
    },
  },
} satisfies Prisma.EditionInclude;

@Injectable()
export class EditionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateEditionDto, user: AuthUser) {
    const book = await this.requireBook(dto.bookId, user);
    const isbn = this.parseIsbn13(dto.isbn);
    const isbn10 = dto.isbn10 ? this.parseIsbn10(dto.isbn10) : undefined;

    return this.prisma.edition.create({
      data: {
        bookId: book.id,
        isbn,
        isbn10,
        format: dto.format,
        title: dto.title,
        publicationDate: dto.publicationDate
          ? new Date(dto.publicationDate)
          : undefined,
        pageCount: dto.pageCount,
        listPriceCents: dto.listPriceCents,
        currency: dto.currency ?? 'USD',
        coverImageUrl: dto.coverImageUrl,
        isActive: dto.isActive ?? true,
      },
      include: editionInclude,
    });
  }

  async findAll(query: EditionQueryDto, user: AuthUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.EditionWhereInput = {
      ...editionScopeWhere(user),
      ...this.buildWhere(query),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.edition.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: editionInclude,
      }),
      this.prisma.edition.count({ where }),
    ]);

    return { data, meta: paginatedMeta(page, limit, total) };
  }

  async findOne(id: string, user: AuthUser) {
    const edition = await this.prisma.edition.findUnique({
      where: { id },
      include: editionInclude,
    });

    if (!edition) {
      throw new NotFoundException(`Edition ${id} not found`);
    }

    assertPublisherAccess(user, edition.book.publisherId);
    return edition;
  }

  async update(id: string, dto: UpdateEditionDto, user: AuthUser) {
    await this.findOne(id, user);

    const isbn = dto.isbn ? this.parseIsbn13(dto.isbn) : undefined;
    const isbn10 =
      dto.isbn10 === undefined
        ? undefined
        : dto.isbn10
          ? this.parseIsbn10(dto.isbn10)
          : null;

    return this.prisma.edition.update({
      where: { id },
      data: {
        isbn,
        isbn10,
        format: dto.format,
        title: dto.title,
        publicationDate:
          dto.publicationDate === undefined
            ? undefined
            : dto.publicationDate
              ? new Date(dto.publicationDate)
              : null,
        pageCount: dto.pageCount,
        listPriceCents: dto.listPriceCents,
        currency: dto.currency,
        coverImageUrl: dto.coverImageUrl,
        isActive: dto.isActive,
      },
      include: editionInclude,
    });
  }

  private buildWhere(query: EditionQueryDto): Prisma.EditionWhereInput {
    const where: Prisma.EditionWhereInput = {};

    if (query.bookId) {
      where.bookId = query.bookId;
    }

    if (query.format) {
      where.format = query.format;
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.search) {
      const isbnDigits = normalizeIsbn(query.search);
      where.OR = [
        { isbn: { contains: isbnDigits || query.search } },
        { isbn10: { contains: isbnDigits || query.search } },
        { title: { contains: query.search, mode: 'insensitive' } },
        { book: { title: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    return where;
  }

  private async requireBook(bookId: string, user: AuthUser) {
    const book = await this.prisma.book.findUnique({
      where: { id: bookId },
      select: { id: true, publisherId: true },
    });
    if (!book) {
      throw new NotFoundException(`Book ${bookId} not found`);
    }
    assertPublisherAccess(user, book.publisherId);
    return book;
  }

  private parseIsbn13(input: string): string {
    const isbn = normalizeIsbn(input);
    if (!isValidIsbn13(isbn)) {
      throw new BadRequestException('isbn must be a valid ISBN-13');
    }
    return isbn;
  }

  private parseIsbn10(input: string): string {
    const isbn = normalizeIsbn(input);
    if (!isValidIsbn10(isbn)) {
      throw new BadRequestException('isbn10 must be a valid ISBN-10');
    }
    return isbn;
  }
}
