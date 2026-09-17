import { HttpException } from '@nestjs/common';

export const SYNC_CONFLICT_CODES = [
  'DUPLICATE',
  'INVALID_COPY',
  'INSUFFICIENT_INVENTORY',
  'ALREADY_SOLD',
  'STALE_DATA',
] as const;

export type SyncConflictCode = (typeof SYNC_CONFLICT_CODES)[number];

export function conflictCodeFromException(error: unknown): SyncConflictCode {
  if (error instanceof HttpException) {
    const payload = error.getResponse();
    if (typeof payload === 'object' && payload && 'error' in payload) {
      const code = String((payload as { error?: unknown }).error);
      if ((SYNC_CONFLICT_CODES as readonly string[]).includes(code)) {
        return code as SyncConflictCode;
      }
    }
    if (error.getStatus() === 409) {
      return 'DUPLICATE';
    }
  }
  return 'INVALID_COPY';
}

export function messageFromException(error: unknown): string {
  if (error instanceof HttpException) {
    const payload = error.getResponse();
    if (typeof payload === 'string') {
      return payload;
    }
    if (typeof payload === 'object' && payload && 'message' in payload) {
      const message = (payload as { message?: unknown }).message;
      if (Array.isArray(message)) {
        return message.join(' ');
      }
      if (typeof message === 'string') {
        return message;
      }
    }
    return error.message;
  }
  return 'Transaction rejected';
}
