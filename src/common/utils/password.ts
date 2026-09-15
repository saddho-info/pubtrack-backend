import { createHash, timingSafeEqual } from 'node:crypto';
import * as bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(
  plain: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, passwordHash);
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function verifyRefreshToken(token: string, tokenHash: string): boolean {
  const computed = hashRefreshToken(token);
  const left = Buffer.from(computed);
  const right = Buffer.from(tokenHash);
  return left.length === right.length && timingSafeEqual(left, right);
}
