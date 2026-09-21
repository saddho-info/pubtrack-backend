import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '../../../generated/prisma/client';
import {
  libraryAdminUser,
  publisherAdminUser,
  superAdminUser,
} from '../testing/auth-user.fixture';
import {
  assertCanAssignRole,
  assertLibraryAccess,
  assertPublisherAccess,
  assertPublisherLibraryLink,
  bookScopeWhere,
  copyScopeWhere,
  distributionScopeWhere,
  editionScopeWhere,
  inventoryScopeWhere,
  libraryScopeWhere,
  movementScopeWhere,
  publisherScopeWhere,
  resolveOwnedPublisherId,
  stockReceiptScopeWhere,
  userScopeWhere,
} from './scoped-where';

describe('scoped-where', () => {
  it('lets SUPER_ADMIN see every publisher and library', () => {
    expect(publisherScopeWhere(superAdminUser)).toEqual({});
    expect(libraryScopeWhere(superAdminUser)).toEqual({});
    expect(userScopeWhere(superAdminUser)).toEqual({});
  });

  it('scopes publisher users to their organization', () => {
    const user = publisherAdminUser('pub_1');
    expect(publisherScopeWhere(user)).toEqual({ id: 'pub_1' });
    expect(userScopeWhere(user)).toEqual({ publisherId: 'pub_1' });
    expect(libraryScopeWhere(user)).toEqual({
      publisherLinks: { some: { publisherId: 'pub_1' } },
    });
  });

  it('scopes library users to their library', () => {
    const user = libraryAdminUser('lib_1');
    expect(libraryScopeWhere(user)).toEqual({ id: 'lib_1' });
    expect(userScopeWhere(user)).toEqual({ libraryId: 'lib_1' });
  });

  it('shows library users the publishers linked to their library', () => {
    expect(publisherScopeWhere(libraryAdminUser('lib_1'))).toEqual({
      libraryLinks: { some: { libraryId: 'lib_1', isActive: true } },
    });
  });

  it('blocks cross-tenant publisher access', () => {
    expect(() =>
      assertPublisherAccess(publisherAdminUser('pub_1'), 'pub_2'),
    ).toThrow(ForbiddenException);
    expect(() => assertPublisherAccess(superAdminUser, 'pub_2')).not.toThrow();
  });

  it('blocks cross-tenant library access for library roles', () => {
    expect(() =>
      assertLibraryAccess(libraryAdminUser('lib_1'), 'lib_2'),
    ).toThrow(ForbiddenException);
    expect(() =>
      assertLibraryAccess(publisherAdminUser('pub_1'), 'lib_2'),
    ).not.toThrow();
  });

  it('requires a publisher↔library link for publisher library access', () => {
    const user = publisherAdminUser('pub_1');
    expect(() => assertPublisherLibraryLink(user, null, 'lib_2')).toThrow(
      ForbiddenException,
    );
    expect(() =>
      assertPublisherLibraryLink(
        user,
        { publisherId: 'pub_1', libraryId: 'lib_2' },
        'lib_2',
      ),
    ).not.toThrow();
    expect(() =>
      assertPublisherLibraryLink(superAdminUser, null, 'lib_2'),
    ).not.toThrow();
  });

  it('scopes catalog rows to the publisher organization', () => {
    expect(bookScopeWhere(superAdminUser)).toEqual({});
    expect(bookScopeWhere(publisherAdminUser('pub_1'))).toEqual({
      publisherId: 'pub_1',
    });
    expect(editionScopeWhere(publisherAdminUser('pub_1'))).toEqual({
      book: { publisherId: 'pub_1' },
    });
    expect(bookScopeWhere(libraryAdminUser('lib_1'))).toEqual({
      id: '__none__',
    });
  });

  it('scopes copies and inventory to the caller organization', () => {
    expect(copyScopeWhere(superAdminUser)).toEqual({});
    expect(copyScopeWhere(publisherAdminUser('pub_1'))).toEqual({
      publisherId: 'pub_1',
    });
    expect(copyScopeWhere(libraryAdminUser('lib_1'))).toEqual({
      libraryId: 'lib_1',
    });
    expect(inventoryScopeWhere(publisherAdminUser('pub_1'))).toEqual({
      edition: { book: { publisherId: 'pub_1' } },
    });
    expect(inventoryScopeWhere(libraryAdminUser('lib_1'))).toEqual({
      holderType: 'LIBRARY',
      holderId: 'lib_1',
    });
    expect(movementScopeWhere(libraryAdminUser('lib_1'))).toEqual({
      OR: [
        { fromHolderType: 'LIBRARY', fromHolderId: 'lib_1' },
        { toHolderType: 'LIBRARY', toHolderId: 'lib_1' },
      ],
    });
    expect(distributionScopeWhere(publisherAdminUser('pub_1'))).toEqual({
      publisherId: 'pub_1',
    });
    expect(distributionScopeWhere(libraryAdminUser('lib_1'))).toEqual({
      libraryId: 'lib_1',
    });
    expect(stockReceiptScopeWhere(libraryAdminUser('lib_1'))).toEqual({
      libraryId: 'lib_1',
    });
    expect(stockReceiptScopeWhere(publisherAdminUser('pub_1'))).toEqual({
      distribution: { publisherId: 'pub_1' },
    });
  });

  it('resolves publisherId from the token for publisher users', () => {
    expect(resolveOwnedPublisherId(publisherAdminUser('pub_1'))).toBe('pub_1');
    expect(resolveOwnedPublisherId(publisherAdminUser('pub_1'), 'pub_1')).toBe(
      'pub_1',
    );
    expect(() =>
      resolveOwnedPublisherId(publisherAdminUser('pub_1'), 'pub_2'),
    ).toThrow(ForbiddenException);
  });

  it('requires SUPER_ADMIN to pass publisherId when creating catalog rows', () => {
    expect(() => resolveOwnedPublisherId(superAdminUser)).toThrow(
      BadRequestException,
    );
    expect(resolveOwnedPublisherId(superAdminUser, 'pub_9')).toBe('pub_9');
  });

  it('restricts role assignment to the actor organization', () => {
    expect(() =>
      assertCanAssignRole(
        publisherAdminUser('pub_1'),
        Role.LIBRARY_STAFF,
        undefined,
        'lib_1',
      ),
    ).toThrow(ForbiddenException);

    expect(() =>
      assertCanAssignRole(
        publisherAdminUser('pub_1'),
        Role.PUBLISHER_STAFF,
        'pub_1',
        null,
      ),
    ).not.toThrow();
  });
});
