import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '../../../generated/prisma/client';

type ErrorBody = {
  statusCode: number;
  message: string | string[];
  error: string;
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const body = this.normalize(exception);

    if (body.statusCode >= 500) {
      this.logger.error(exception);
    }

    response.status(body.statusCode).json({
      ...body,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }

  private normalize(exception: unknown): ErrorBody {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        return {
          statusCode,
          message: payload,
          error: exception.name,
        };
      }

      const record = payload as Record<string, unknown>;
      const message =
        (record.message as string | string[]) ?? exception.message;
      const error =
        (record.error as string) ?? HttpStatus[statusCode] ?? exception.name;

      return { statusCode, message, error };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.prismaError(exception);
    }

    if (exception instanceof Prisma.PrismaClientInitializationError) {
      return {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message:
          'Database is unavailable. Check DATABASE_URL and that migrations are applied.',
        error: 'Service Unavailable',
      };
    }

    // Prisma driver-adapter / pg errors often wrap as plain Error.
    if (exception instanceof Error) {
      const msg = exception.message;
      if (
        /relation .* does not exist/i.test(msg) ||
        /table .* does not exist/i.test(msg) ||
        exception.name === 'DriverAdapterError'
      ) {
        return {
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          message:
            'Database schema is missing or incomplete. Run `npx prisma migrate deploy` against Neon, then `npm run prisma:seed`.',
          error: 'Service Unavailable',
        };
      }
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: 'Internal Server Error',
    };
  }

  private prismaError(
    exception: Prisma.PrismaClientKnownRequestError,
  ): ErrorBody {
    switch (exception.code) {
      case 'P2002': {
        const target = Array.isArray(exception.meta?.target)
          ? exception.meta.target.join(', ')
          : 'field';
        return {
          statusCode: HttpStatus.CONFLICT,
          message: `A record with this ${target} already exists`,
          error: 'Conflict',
        };
      }
      case 'P2025':
        return {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Record not found',
          error: 'Not Found',
        };
      case 'P2003':
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Related record does not exist',
          error: 'Bad Request',
        };
      default:
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Internal server error',
          error: 'Internal Server Error',
        };
    }
  }
}
