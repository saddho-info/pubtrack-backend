import { Role } from '../../../generated/prisma/client';
import { AuthUser } from '../types/auth-user';

export const superAdminUser: AuthUser = {
  sub: 'user_sa',
  id: 'user_sa',
  email: 'leo.a@example.org',
  role: Role.SUPER_ADMIN,
  publisherId: null,
  libraryId: null,
};

export function publisherAdminUser(publisherId: string): AuthUser {
  return {
    sub: 'user_pa',
    id: 'user_pa',
    email: 'quinn.m@example.net',
    role: Role.PUBLISHER_ADMIN,
    publisherId,
    libraryId: null,
  };
}

export function publisherStaffUser(publisherId: string): AuthUser {
  return {
    sub: 'user_ps',
    id: 'user_ps',
    email: 'staff@northwind.example',
    role: Role.PUBLISHER_STAFF,
    publisherId,
    libraryId: null,
  };
}

export function libraryAdminUser(libraryId: string): AuthUser {
  return {
    sub: 'user_la',
    id: 'user_la',
    email: 'walt.e@example.net',
    role: Role.LIBRARY_ADMIN,
    publisherId: null,
    libraryId,
  };
}
