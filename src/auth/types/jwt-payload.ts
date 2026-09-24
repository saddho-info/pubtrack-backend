import { Role } from '../../../generated/prisma/client';

export type JwtPayload = {
  sub: string;
  email: string;
  role: Role;
  publisherId: string | null;
  libraryId: string | null;
  sid?: string;
  jti?: string;
};
