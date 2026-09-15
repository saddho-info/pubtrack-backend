import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryHolderType, Prisma } from '../../generated/prisma/client';
import { paginatedMeta } from '../common/dto/pagination.dto';
import {
  AuthUser,
  isLibraryRole,
  isPublisherRole,
  isSuperAdmin,
} from '../common/types/auth-user';
import { slugifyOrFallback } from '../common/utils/slugify';
import {
  assertLibraryAccess,
  assertPublisherLibraryLink,
  canManageLibraryLinks,
  libraryScopeWhere,
  resolveOwnedPublisherId,
} from '../common/utils/scoped-where';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLibraryDto } from './dto/create-library.dto';
import { LibraryQueryDto } from './dto/library-query.dto';
import { LinkLibraryDto } from './dto/link-library.dto';
import { UpdateLibraryDto } from './dto/update-library.dto';
import { UpdateLibraryLinkDto } from './dto/update-library-link.dto';

const libraryInclude = {
  _count: { select: { users: true } },
} satisfies Prisma.LibraryInclude;

type LibraryStock = {
  onHand: number;
  inTransit: number;
  sold: number;
  returned: number;
  lost: number;
  copyCount: number;
};

const EMPTY_STOCK: LibraryStock = {
  onHand: 0,
  inTransit: 0,
  sold: 0,
  returned: 0,
  lost: 0,
  copyCount: 0,
};

type LinkRow = {
  id: string;
  publisherId: string;
  libraryId: string;
  isActive: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class LibrariesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateLibraryDto, user: AuthUser) {
    this.assertCanManageLinks(user);
    const publisherId = this.resolveOptionalPublisherId(user, dto.publisherId);
    const slug = await this.uniqueSlug(
      dto.slug ?? slugifyOrFallback(dto.name, 'library'),
    );

    return this.prisma.$transaction(async (tx) => {
      const library = await tx.library.create({
        data: {
          name: dto.name,
          slug,
          email: dto.email,
          phone: dto.phone,
          address: dto.address,
          isActive: dto.isActive ?? true,
        },
        include: libraryInclude,
      });

      let link: LinkRow | null = null;
      if (publisherId) {
        await this.assertPublisherExists(tx, publisherId);
        link = await tx.publisherLibrary.create({
          data: {
            publisherId,
            libraryId: library.id,
            notes: dto.notes,
          },
        });
      }

      return this.serialize(library, link, EMPTY_STOCK);
    });
  }

  async findAll(query: LibraryQueryDto, user: AuthUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const publisherId = this.listPublisherId(user, query.publisherId);
    const where: Prisma.LibraryWhereInput = {
      ...this.buildWhere(query, publisherId),
      ...libraryScopeWhere(user),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.library.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          ...libraryInclude,
          publisherLinks: publisherId
            ? { where: { publisherId } }
            : { take: 0 },
        },
      }),
      this.prisma.library.count({ where }),
    ]);

    const stockByLibrary = publisherId
      ? await this.stockByLibraryIds(
          publisherId,
          rows.map((row) => row.id),
        )
      : new Map<string, LibraryStock>();

    return {
      data: rows.map((row) => {
        const { publisherLinks, ...library } = row;
        return this.serialize(
          library,
          publisherLinks[0] ?? null,
          stockByLibrary.get(row.id) ?? EMPTY_STOCK,
        );
      }),
      meta: paginatedMeta(page, limit, total),
    };
  }

  async findOne(id: string, user: AuthUser) {
    const library = await this.prisma.library.findUnique({
      where: { id },
      include: libraryInclude,
    });

    if (!library) {
      throw new NotFoundException(`Library ${id} not found`);
    }

    if (isLibraryRole(user.role)) {
      assertLibraryAccess(user, library.id);
      return this.serialize(library, null, EMPTY_STOCK);
    }

    const publisherId = this.callerPublisherId(user);
    const link = publisherId
      ? await this.findLink(publisherId, library.id)
      : null;

    if (isPublisherRole(user.role)) {
      assertPublisherLibraryLink(user, link, library.id);
    }

    const stock =
      publisherId && link
        ? await this.stockForLibrary(publisherId, library.id)
        : EMPTY_STOCK;

    return this.serialize(library, link, stock);
  }

  async update(id: string, dto: UpdateLibraryDto, user: AuthUser) {
    const current = await this.requireLibrary(id);

    if (isLibraryRole(user.role)) {
      assertLibraryAccess(user, current.id);
    } else if (isPublisherRole(user.role)) {
      this.assertCanManageLinks(user);
      const link = await this.findLink(user.publisherId as string, current.id);
      assertPublisherLibraryLink(user, link, current.id);
    } else if (!isSuperAdmin(user.role)) {
      throw new ForbiddenException('Cannot update this library');
    }

    const slug =
      dto.slug && dto.slug !== current.slug
        ? await this.uniqueSlug(dto.slug, current.id)
        : dto.slug;

    const library = await this.prisma.library.update({
      where: { id },
      data: {
        name: dto.name,
        slug,
        email: dto.email,
        phone: dto.phone,
        address: dto.address,
        isActive: dto.isActive,
      },
      include: libraryInclude,
    });

    const publisherId = this.callerPublisherId(user);
    const link = publisherId
      ? await this.findLink(publisherId, library.id)
      : null;
    const stock =
      publisherId && link
        ? await this.stockForLibrary(publisherId, library.id)
        : EMPTY_STOCK;

    return this.serialize(library, link, stock);
  }

  async link(dto: LinkLibraryDto, user: AuthUser) {
    this.assertCanManageLinks(user);
    if (!dto.libraryId && !dto.slug) {
      throw new BadRequestException('libraryId or slug is required');
    }

    const publisherId = resolveOwnedPublisherId(user, dto.publisherId);
    await this.assertPublisherExists(this.prisma, publisherId);

    const library = dto.libraryId
      ? await this.prisma.library.findUnique({
          where: { id: dto.libraryId },
          include: libraryInclude,
        })
      : await this.prisma.library.findUnique({
          where: { slug: dto.slug as string },
          include: libraryInclude,
        });

    if (!library) {
      throw new NotFoundException('Library not found');
    }
    if (!library.isActive) {
      throw new BadRequestException('Cannot link an inactive library');
    }

    const existing = await this.findLink(publisherId, library.id);
    if (existing) {
      throw new ConflictException(
        'Library is already linked to this publisher',
      );
    }

    const link = await this.prisma.publisherLibrary.create({
      data: {
        publisherId,
        libraryId: library.id,
        notes: dto.notes,
      },
    });

    return this.serialize(library, link, EMPTY_STOCK);
  }

  async updateLink(
    libraryId: string,
    dto: UpdateLibraryLinkDto,
    user: AuthUser,
  ) {
    this.assertCanManageLinks(user);
    const publisherId = resolveOwnedPublisherId(user, dto.publisherId);
    await this.requireLibrary(libraryId);
    const link = await this.findLink(publisherId, libraryId);
    if (!link) {
      throw new NotFoundException('Library is not linked to this publisher');
    }
    assertPublisherLibraryLink(user, link, libraryId);

    const updated = await this.prisma.publisherLibrary.update({
      where: { id: link.id },
      data: {
        notes: dto.notes,
        isActive: dto.isActive,
      },
    });

    const library = await this.prisma.library.findUniqueOrThrow({
      where: { id: libraryId },
      include: libraryInclude,
    });
    const stock = await this.stockForLibrary(publisherId, libraryId);
    return this.serialize(library, updated, stock);
  }

  async unlink(libraryId: string, user: AuthUser, publisherIdQuery?: string) {
    this.assertCanManageLinks(user);
    const publisherId = resolveOwnedPublisherId(user, publisherIdQuery);
    await this.requireLibrary(libraryId);
    const link = await this.findLink(publisherId, libraryId);
    if (!link) {
      throw new NotFoundException('Library is not linked to this publisher');
    }
    assertPublisherLibraryLink(user, link, libraryId);

    await this.prisma.publisherLibrary.delete({ where: { id: link.id } });
  }

  private serialize(
    library: {
      id: string;
      name: string;
      slug: string;
      email: string | null;
      phone: string | null;
      address: string | null;
      isActive: boolean;
      createdAt: Date;
      updatedAt: Date;
      _count: { users: number };
    },
    link: LinkRow | null,
    stock: LibraryStock,
  ) {
    return {
      id: library.id,
      name: library.name,
      slug: library.slug,
      email: library.email,
      phone: library.phone,
      address: library.address,
      isActive: library.isActive,
      createdAt: library.createdAt,
      updatedAt: library.updatedAt,
      _count: library._count,
      link: link
        ? {
            id: link.id,
            publisherId: link.publisherId,
            isActive: link.isActive,
            notes: link.notes,
            createdAt: link.createdAt,
            updatedAt: link.updatedAt,
          }
        : null,
      stock,
    };
  }

  private buildWhere(
    query: LibraryQueryDto,
    publisherId?: string,
  ): Prisma.LibraryWhereInput {
    const where: Prisma.LibraryWhereInput = {};

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { slug: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (publisherId) {
      where.publisherLinks = {
        some: { publisherId },
      };
    }

    return where;
  }

  private listPublisherId(
    user: AuthUser,
    requested?: string,
  ): string | undefined {
    if (isPublisherRole(user.role) && user.publisherId) {
      if (requested && requested !== user.publisherId) {
        throw new ForbiddenException('Cannot access another publisher');
      }
      return user.publisherId;
    }
    if (isSuperAdmin(user.role) && requested) {
      return requested;
    }
    return undefined;
  }

  private callerPublisherId(user: AuthUser): string | undefined {
    if (isPublisherRole(user.role) && user.publisherId) {
      return user.publisherId;
    }
    return undefined;
  }

  private resolveOptionalPublisherId(
    user: AuthUser,
    requested?: string,
  ): string | undefined {
    if (isPublisherRole(user.role)) {
      return resolveOwnedPublisherId(user, requested);
    }
    if (isSuperAdmin(user.role) && requested) {
      return requested;
    }
    return undefined;
  }

  private assertCanManageLinks(user: AuthUser) {
    if (!canManageLibraryLinks(user)) {
      throw new ForbiddenException(
        'Only publisher admins can manage library partnerships',
      );
    }
  }

  private async requireLibrary(id: string) {
    const library = await this.prisma.library.findUnique({
      where: { id },
      include: libraryInclude,
    });
    if (!library) {
      throw new NotFoundException(`Library ${id} not found`);
    }
    return library;
  }

  private async findLink(
    publisherId: string,
    libraryId: string,
  ): Promise<LinkRow | null> {
    return this.prisma.publisherLibrary.findUnique({
      where: {
        publisherId_libraryId: { publisherId, libraryId },
      },
    });
  }

  private async assertPublisherExists(
    db: PrismaService | Prisma.TransactionClient,
    publisherId: string,
  ) {
    const publisher = await db.publisher.findUnique({
      where: { id: publisherId },
      select: { id: true },
    });
    if (!publisher) {
      throw new NotFoundException(`Publisher ${publisherId} not found`);
    }
  }

  private async uniqueSlug(base: string, excludeId?: string): Promise<string> {
    let slug = base;
    let n = 2;
    while (
      await this.prisma.library.findFirst({
        where: {
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

  private async stockForLibrary(
    publisherId: string,
    libraryId: string,
  ): Promise<LibraryStock> {
    const map = await this.stockByLibraryIds(publisherId, [libraryId]);
    return map.get(libraryId) ?? EMPTY_STOCK;
  }

  private async stockByLibraryIds(
    publisherId: string,
    libraryIds: string[],
  ): Promise<Map<string, LibraryStock>> {
    const result = new Map<string, LibraryStock>();
    if (libraryIds.length === 0) {
      return result;
    }

    const [aggregates, copyCounts] = await Promise.all([
      this.prisma.inventory.groupBy({
        by: ['holderId'],
        where: {
          holderType: InventoryHolderType.LIBRARY,
          holderId: { in: libraryIds },
          edition: { book: { publisherId } },
        },
        _sum: {
          onHand: true,
          inTransit: true,
          sold: true,
          returned: true,
          lost: true,
        },
      }),
      this.prisma.bookCopy.groupBy({
        by: ['libraryId'],
        where: {
          publisherId,
          libraryId: { in: libraryIds },
        },
        _count: { _all: true },
      }),
    ]);

    for (const id of libraryIds) {
      result.set(id, { ...EMPTY_STOCK });
    }

    for (const row of aggregates) {
      const current = result.get(row.holderId) ?? { ...EMPTY_STOCK };
      current.onHand = row._sum.onHand ?? 0;
      current.inTransit = row._sum.inTransit ?? 0;
      current.sold = row._sum.sold ?? 0;
      current.returned = row._sum.returned ?? 0;
      current.lost = row._sum.lost ?? 0;
      result.set(row.holderId, current);
    }

    for (const row of copyCounts) {
      if (!row.libraryId) {
        continue;
      }
      const current = result.get(row.libraryId) ?? { ...EMPTY_STOCK };
      current.copyCount = row._count._all;
      result.set(row.libraryId, current);
    }

    return result;
  }
}
