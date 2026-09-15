import { Role, User } from '../../../generated/prisma/client';

export type PublicUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  isActive: boolean;
  publisherId: string | null;
  libraryId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function toPublicUser(
  user: Pick<
    User,
    | 'id'
    | 'email'
    | 'firstName'
    | 'lastName'
    | 'role'
    | 'isActive'
    | 'publisherId'
    | 'libraryId'
    | 'createdAt'
    | 'updatedAt'
  >,
): PublicUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    isActive: user.isActive,
    publisherId: user.publisherId,
    libraryId: user.libraryId,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
