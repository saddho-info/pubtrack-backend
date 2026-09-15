import { randomBytes } from 'node:crypto';

const TOKEN_BYTES = 24;

/** Opaque URL-safe token. Never encode copy ids or business data in a QR. */
export function generateQrToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}
