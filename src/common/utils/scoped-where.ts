import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  InventoryHolderType,
  Prisma,
  Role,
} from '../../../generated/prisma/client';
import {
  AuthUser,
  isLibraryRole,
  isPublisherRole,
  isSuperAdmin,
} from '../types/auth-user';

export function publisherScopeWhere(
  user: AuthUser,
): Prisma.PublisherWhereInput {
  if (isSuperAdmin(user.role)) {
    return {};
  }
  if (isPublisherRole(user.role) && user.publisherId) {
    return { id: user.publisherId };
  }
  // Library users see the publishers allowed to distribute to them, not the
  // organization they belong to.
  if (isLibraryRole(user.role) && user.libraryId) {
    return {
      libraryLinks: { some: { libraryId: user.libraryId, isActive: true } },
    };
  }
  return { id: '__none__' };
}

export function libraryScopeWhere(user: AuthUser): Prisma.LibraryWhereInput {
  if (isSuperAdmin(user.role)) {
    return {};
  }
  if (isPublisherRole(user.role) && user.publisherId) {
    return {
      publisherLinks: { some: { publisherId: user.publisherId } },
    };
  }
  if (isLibraryRole(user.role) && user.libraryId) {
    return { id: user.libraryId };
  }
  return { id: '__none__' };
}

export function userScopeWhere(user: AuthUser): Prisma.UserWhereInput {
  if (isSuperAdmin(user.role)) {
    return {};
  }
  if (isPublisherRole(user.role) && user.publisherId) {
    return { publisherId: user.publisherId };
  }
  if (isLibraryRole(user.role) && user.libraryId) {
    return { libraryId: user.libraryId };
  }
  return { id: user.id };
}

export function bookScopeWhere(user: AuthUser): Prisma.BookWhereInput {
  if (isSuperAdmin(user.role)) {
    return {};
  }
  if (isPublisherRole(user.role) && user.publisherId) {
    return { publisherId: user.publisherId };
  }
  return { id: '__none__' };
}

export function editionScopeWhere(user: AuthUser): Prisma.EditionWhereInput {
  return { book: bookScopeWhere(user) };
}

export function copyScopeWhere(user: AuthUser): Prisma.BookCopyWhereInput {
  if (isSuperAdmin(user.role)) {
    return {};
  }
  if (isPublisherRole(user.role) && user.publisherId) {
    return { publisherId: user.publisherId };
  }
  if (isLibraryRole(user.role) && user.libraryId) {
    return { libraryId: user.libraryId };
  }
  return { id: '__none__' };
}

export function inventoryScopeWhere(
  user: AuthUser,
): Prisma.InventoryWhereInput {
  if (isSuperAdmin(user.role)) {
    return {};
  }
  if (isPublisherRole(user.role) && user.publisherId) {
    return { edition: { book: { publisherId: user.publisherId } } };
  }
  if (isLibraryRole(user.role) && user.libraryId) {
    return {
      holderType: InventoryHolderType.LIBRARY,
      holderId: user.libraryId,
    };
  }
  return { id: '__none__' };
}

export function movementScopeWhere(
  user: AuthUser,
): Prisma.InventoryMovementWhereInput {
  if (isSuperAdmin(user.role)) {
    return {};
  }
  if (isPublisherRole(user.role) && user.publisherId) {
    return { edition: { book: { publisherId: user.publisherId } } };
  }
  if (isLibraryRole(user.role) && user.libraryId) {
    return {
      OR: [
        {
          fromHolderType: InventoryHolderType.LIBRARY,
          fromHolderId: user.libraryId,
        },
        {
          toHolderType: InventoryHolderType.LIBRARY,
          toHolderId: user.libraryId,
        },
      ],
    };
  }
  return { id: '__none__' };
}

export function distributionScopeWhere(
  user: AuthUser,
): Prisma.DistributionWhereInput {
  if (isSuperAdmin(user.role)) {
    return {};
  }
  if (isPublisherRole(user.role) && user.publisherId) {
    return { publisherId: user.publisherId };
  }
  if (isLibraryRole(user.role) && user.libraryId) {
    return { libraryId: user.libraryId };
  }
  return { id: '__none__' };
}

export function stockReceiptScopeWhere(
  user: AuthUser,
): Prisma.StockReceiptWhereInput {
  if (isSuperAdmin(user.role)) {
    return {};
  }
  if (isPublisherRole(user.role) && user.publisherId) {
    return { distribution: { publisherId: user.publisherId } };
  }
  if (isLibraryRole(user.role) && user.libraryId) {
    return { libraryId: user.libraryId };
  }
  return { id: '__none__' };
}

export function saleScopeWhere(user: AuthUser): Prisma.SaleWhereInput {
  if (isSuperAdmin(user.role)) {
    return {};
  }
  if (isPublisherRole(user.role) && user.publisherId) {
    return {
      items: {
        some: {
          edition: { book: { publisherId: user.publisherId } },
        },
      },
    };
  }
  if (isLibraryRole(user.role) && user.libraryId) {
    return { libraryId: user.libraryId };
  }
  return { id: '__none__' };
}

export function resolveOwnedPublisherId(
  user: AuthUser,
  requested?: string,
): string {
  if (isSuperAdmin(user.role)) {
    if (!requested) {
      throw new BadRequestException('publisherId is required');
    }
    return requested;
  }
  if (isPublisherRole(user.role) && user.publisherId) {
    if (requested && requested !== user.publisherId) {
      throw new ForbiddenException('Cannot access another publisher');
    }
    return user.publisherId;
  }
  throw new ForbiddenException('Publisher scope required');
}

export function resolveOwnedLibraryId(
  user: AuthUser,
  requested?: string,
): string {
  if (isSuperAdmin(user.role)) {
    if (!requested) {
      throw new BadRequestException('libraryId is required');
    }
    return requested;
  }
  if (isLibraryRole(user.role) && user.libraryId) {
    if (requested && requested !== user.libraryId) {
      throw new ForbiddenException('Cannot access another library');
    }
    return user.libraryId;
  }
  throw new ForbiddenException('Library scope required');
}

export function assertPublisherAccess(
  user: AuthUser,
  publisherId: string,
): void {
  if (isSuperAdmin(user.role)) {
    return;
  }
  if (isPublisherRole(user.role) && user.publisherId === publisherId) {
    return;
  }
  throw new ForbiddenException('Cannot access another publisher');
}

export function assertLibraryAccess(user: AuthUser, libraryId: string): void {
  if (isSuperAdmin(user.role)) {
    return;
  }
  if (isPublisherRole(user.role)) {
    return;
  }
  if (isLibraryRole(user.role) && user.libraryId === libraryId) {
    return;
  }
  throw new ForbiddenException('Cannot access another library');
}

/**
 * Publisher users may only act on libraries they have a PublisherLibrary row for.
 * SUPER_ADMIN and library roles follow assertLibraryAccess.
 */
export function assertPublisherLibraryLink(
  user: AuthUser,
  linked: { publisherId: string; libraryId: string } | null,
  libraryId: string,
): void {
  if (isSuperAdmin(user.role)) {
    return;
  }
  if (isLibraryRole(user.role)) {
    assertLibraryAccess(user, libraryId);
    return;
  }
  if (
    isPublisherRole(user.role) &&
    user.publisherId &&
    linked?.publisherId === user.publisherId &&
    linked.libraryId === libraryId
  ) {
    return;
  }
  throw new ForbiddenException('Library is not linked to this publisher');
}

export function canManageLibraryLinks(user: AuthUser): boolean {
  return isSuperAdmin(user.role) || user.role === Role.PUBLISHER_ADMIN;
}

export function assertCanAssignRole(
  actor: AuthUser,
  targetRole: Role,
  publisherId?: string | null,
  libraryId?: string | null,
): void {
  if (isSuperAdmin(actor.role)) {
    return;
  }

  if (actor.role === Role.PUBLISHER_ADMIN) {
    if (!isPublisherRole(targetRole) || publisherId !== actor.publisherId) {
      throw new ForbiddenException('Cannot assign this role or organization');
    }
    return;
  }

  if (actor.role === Role.LIBRARY_ADMIN) {
    if (!isLibraryRole(targetRole) || libraryId !== actor.libraryId) {
      throw new ForbiddenException('Cannot assign this role or organization');
    }
    return;
  }

  throw new ForbiddenException('Not allowed to manage users');
}
