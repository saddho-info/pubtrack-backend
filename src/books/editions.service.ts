import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CopyStatus,
  DistributionStatus,
  Prisma,
} from '../../generated/prisma/client';
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
import {
  CurrencyRevenueDto,
  LibraryPerformanceResponseDto,
} from './dto/library-performance-response.dto';
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

  async getLibraryPerformance(
    editionId: string,
    user: AuthUser,
  ): Promise<LibraryPerformanceResponseDto> {
    const edition = await this.prisma.edition.findUnique({
      where: { id: editionId },
      select: {
        id: true,
        bookId: true,
        title: true,
        format: true,
        isbn: true,
        isbn10: true,
        listPriceCents: true,
        currency: true,
        book: {
          select: {
            id: true,
            title: true,
            authors: true,
            publisherId: true,
          },
        },
      },
    });

    if (!edition) {
      throw new NotFoundException(`Edition ${editionId} not found`);
    }

    assertPublisherAccess(user, edition.book.publisherId);

    const [distributionItems, copyCounts, saleItems] = await Promise.all([
      this.prisma.distributionItem.findMany({
        where: {
          editionId,
          distribution: {
            status: {
              in: [
                DistributionStatus.DISPATCHED,
                DistributionStatus.PARTIALLY_RECEIVED,
                DistributionStatus.RECEIVED,
              ],
            },
          },
        },
        select: {
          quantity: true,
          distribution: { select: { libraryId: true } },
        },
      }),
      this.prisma.bookCopy.groupBy({
        by: ['libraryId', 'status'],
        where: {
          editionId,
          libraryId: { not: null },
          status: {
            in: [CopyStatus.IN_STOCK_LIBRARY, CopyStatus.DISTRIBUTED],
          },
        },
        _count: { _all: true },
      }),
      this.prisma.saleItem.findMany({
        where: { editionId },
        select: {
          quantity: true,
          unitPriceCents: true,
          sale: {
            select: {
              libraryId: true,
              currency: true,
            },
          },
        },
      }),
    ]);

    type Totals = {
      totalDistributed: number;
      inStock: number;
      inTransit: number;
      sold: number;
      revenueByCurrency: Map<string, number>;
    };

    const totalsByLibrary = new Map<string, Totals>();
    const totalsFor = (libraryId: string): Totals => {
      let totals = totalsByLibrary.get(libraryId);
      if (!totals) {
        totals = {
          totalDistributed: 0,
          inStock: 0,
          inTransit: 0,
          sold: 0,
          revenueByCurrency: new Map<string, number>(),
        };
        totalsByLibrary.set(libraryId, totals);
      }
      return totals;
    };

    for (const item of distributionItems) {
      totalsFor(item.distribution.libraryId).totalDistributed += item.quantity;
    }

    for (const count of copyCounts) {
      if (!count.libraryId) {
        continue;
      }
      const totals = totalsFor(count.libraryId);
      if (count.status === CopyStatus.IN_STOCK_LIBRARY) {
        totals.inStock += count._count._all;
      } else if (count.status === CopyStatus.DISTRIBUTED) {
        totals.inTransit += count._count._all;
      }
    }

    for (const item of saleItems) {
      const totals = totalsFor(item.sale.libraryId);
      totals.sold += item.quantity;
      const revenue = item.unitPriceCents * item.quantity;
      totals.revenueByCurrency.set(
        item.sale.currency,
        (totals.revenueByCurrency.get(item.sale.currency) ?? 0) + revenue,
      );
    }

    const libraries = await this.prisma.library.findMany({
      where: { id: { in: [...totalsByLibrary.keys()] } },
      select: { id: true, name: true, slug: true },
    });

    const currencyTotals = (
      revenueByCurrency: Map<string, number>,
    ): CurrencyRevenueDto[] =>
      [...revenueByCurrency.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([currency, totalCents]) => ({ currency, totalCents }));

    const rows = libraries
      .map((library) => {
        const totals = totalsByLibrary.get(library.id);
        if (!totals) {
          throw new Error(
            `Missing performance totals for library ${library.id}`,
          );
        }
        return {
          library,
          totalDistributed: totals.totalDistributed,
          inStock: totals.inStock,
          inTransit: totals.inTransit,
          sold: totals.sold,
          revenueByCurrency: currencyTotals(totals.revenueByCurrency),
        };
      })
      .sort(
        (left, right) =>
          right.sold - left.sold ||
          left.library.name.localeCompare(right.library.name),
      );

    const summaryRevenue = new Map<string, number>();
    const summary = rows.reduce(
      (totals, row) => {
        totals.totalDistributed += row.totalDistributed;
        totals.inStock += row.inStock;
        totals.inTransit += row.inTransit;
        totals.sold += row.sold;
        for (const revenue of row.revenueByCurrency) {
          summaryRevenue.set(
            revenue.currency,
            (summaryRevenue.get(revenue.currency) ?? 0) + revenue.totalCents,
          );
        }
        return totals;
      },
      {
        libraryCount: rows.length,
        totalDistributed: 0,
        inStock: 0,
        inTransit: 0,
        sold: 0,
      },
    );

    return {
      book: edition.book,
      edition: {
        id: edition.id,
        bookId: edition.bookId,
        title: edition.title,
        format: edition.format,
        isbn: edition.isbn,
        isbn10: edition.isbn10,
        listPriceCents: edition.listPriceCents,
        currency: edition.currency,
      },
      summary: {
        ...summary,
        revenueByCurrency: currencyTotals(summaryRevenue),
      },
      libraries: rows,
    };
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
