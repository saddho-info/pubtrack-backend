import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
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

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request & { user?: AuthUser }>();
    const response = http.getResponse<Response>();

    if (!MUTATING.has(request.method)) {
      return next.handle();
    }

    const entity = this.resolveEntity(request.path);
    if (!entity) {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: (body) => {
          void this.audit.write({
            actorUserId: request.user?.id ?? null,
            action: `${request.method} ${entity.entityType}`,
            entityType: entity.entityType,
            entityId: this.entityId(request, body),
            method: request.method,
            path: request.originalUrl ?? request.url,
            statusCode: response.statusCode,
            metadata: {
              params: request.params,
            },
            ip: request.ip,
          });
        },
      }),
    );
  }

  private resolveEntity(path: string) {
    return ENTITY_PREFIXES.find((row) => path.startsWith(row.prefix));
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
}
