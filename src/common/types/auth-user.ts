import { Role } from '../../../generated/prisma/client';

export type AuthUser = {
  sub: string;
  id: string;
  email: string;
  role: Role;
  publisherId: string | null;
  libraryId: string | null;
};

export const PUBLISHER_ROLES: Role[] = [
  Role.PUBLISHER_ADMIN,
  Role.PUBLISHER_STAFF,
];

export const LIBRARY_ROLES: Role[] = [Role.LIBRARY_ADMIN, Role.LIBRARY_STAFF];

export function isPublisherRole(role: Role): boolean {
  return PUBLISHER_ROLES.includes(role);
}

export function isLibraryRole(role: Role): boolean {
  return LIBRARY_ROLES.includes(role);
}

export function isSuperAdmin(role: Role): boolean {
  return role === Role.SUPER_ADMIN;
}
