import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { Prisma } from '../../generated/prisma/client';
import type { AuthUser } from '../common/types/auth-user';
import { AuditService } from './audit.service';

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

const ENTITY_PREFIXES: Array<{ prefix: string; entityType: string }> = [
  { prefix: '/api/v1/sales', entityType: 'Sale' },
  { prefix: '/api/v1/stock-receipts', entityType: 'StockReceipt' },
  { prefix: '/api/v1/distributions', entityType: 'Distribution' },
  { prefix: '/api/v1/copies', entityType: 'BookCopy' },
  { prefix: '/api/v1/inventory', entityType: 'Inventory' },
  { prefix: '/api/v1/sync', entityType: 'SyncTransaction' },
];

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'refreshToken',
  'refreshTokenHash',
  'token',
  'accessToken',
]);

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request & { user?: AuthUser }>();
    const response = http.getResponse<Response>();

    if (!MUTATING.has(request.method)) {
      return next.handle();
    }

    const entity = this.resolveEntity(request.originalUrl ?? request.url);
    if (!entity) {
      return next.handle();
    }

    const beforeSnapshot = this.sanitize(request.body);

    return next.handle().pipe(
      tap({
        next: (body) => {
          void this.audit
            .write({
              actorUserId: request.user?.id ?? null,
              action: `${request.method} ${entity.entityType}`,
              entityType: entity.entityType,
              entityId: this.entityId(request, body),
              method: request.method,
              path: (request.originalUrl ?? request.url).split('?')[0],
              statusCode: response.statusCode,
              metadata: {
                params: request.params,
                before: beforeSnapshot,
                after: this.afterSnapshot(body),
              } as Prisma.InputJsonValue,
              ip: request.ip,
            })
            .catch((error: unknown) => {
              this.logger.warn(
                `Failed to write audit log: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              );
            });
        },
      }),
    );
  }

  private resolveEntity(rawPath: string) {
    const path = rawPath.split('?')[0];
    const candidates = [path];
    if (!path.startsWith('/api/v1')) {
      candidates.push(`/api/v1${path.startsWith('/') ? path : `/${path}`}`);
    }
    for (const candidate of candidates) {
      const match = ENTITY_PREFIXES.find(
        (row) =>
          candidate === row.prefix || candidate.startsWith(`${row.prefix}/`),
      );
      if (match) {
        return match;
      }
    }
    return undefined;
  }

  private entityId(request: Request, body: unknown): string | null {
    const paramId = request.params?.id;
    if (typeof paramId === 'string' && paramId.length > 0) {
      return paramId;
    }
    if (body && typeof body === 'object' && 'id' in body) {
      const id = (body as { id?: unknown }).id;
      if (typeof id === 'string') {
        return id;
      }
    }
    return null;
  }

  private afterSnapshot(body: unknown): unknown {
    if (!body || typeof body !== 'object') {
      return null;
    }
    const record = body as Record<string, unknown>;
    return {
      id: typeof record.id === 'string' ? record.id : undefined,
      code: typeof record.code === 'string' ? record.code : undefined,
      status: typeof record.status === 'string' ? record.status : undefined,
    };
  }

  private sanitize(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.slice(0, 20).map((item) => this.sanitize(item));
    }
    if (!value || typeof value !== 'object') {
      return value ?? null;
    }
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(key)) {
        out[key] = '[redacted]';
      } else {
        out[key] = this.sanitize(entry);
      }
    }
    return out;
  }
}
