import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Transform, plainToInstance } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';
import { parse as parseEnvFile } from 'dotenv';

export class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @Transform(({ value }: { value: unknown }) => {
    if (value === undefined || value === null || value === '') {
      return 3000;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  })
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @IsString()
  @IsNotEmpty()
  JWT_ACCESS_SECRET: string;

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_SECRET: string;

  @IsOptional()
  @IsString()
  JWT_ACCESS_EXPIRES_IN?: string;

  @IsOptional()
  @IsString()
  JWT_REFRESH_EXPIRES_IN?: string;

  @Transform(({ value }: { value: unknown }) => {
    if (value === undefined || value === null || value === '') {
      return 900;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  })
  @IsInt()
  @Min(30)
  JWT_ACCESS_EXPIRES_SECONDS = 900;

  @Transform(({ value }: { value: unknown }) => {
    if (value === undefined || value === null || value === '') {
      return 604800;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  })
  @IsInt()
  @Min(60)
  JWT_REFRESH_EXPIRES_SECONDS = 604800;

  @IsOptional()
  @IsString()
  CORS_ORIGINS?: string;

  @IsOptional()
  @IsString()
  NODE_ENV?: string;
}

export function isPrismaPlaceholderUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.username === 'johndoe' || parsed.pathname === '/mydb';
  } catch {
    return /\bjohndoe\b/.test(url);
  }
}

/**
 * Nest ConfigModule lets an existing process.env.DATABASE_URL win over `.env`.
 * `prisma init` leaves `postgresql://johndoe:...@.../mydb` in the shell, which
 * then shadows the real local URL and fails at runtime with P1010.
 */
export function resolveDatabaseUrl(
  configured: unknown,
  envFileUrl?: string,
): string {
  const configuredUrl = typeof configured === 'string' ? configured.trim() : '';
  if (configuredUrl && !isPrismaPlaceholderUrl(configuredUrl)) {
    return configuredUrl;
  }

  const fileUrl = envFileUrl?.trim();
  if (fileUrl && !isPrismaPlaceholderUrl(fileUrl)) {
    return fileUrl;
  }

  const localUser = process.env.USER ?? process.env.USERNAME ?? '<os-user>';
  throw new Error(
    `DATABASE_URL uses Prisma's placeholder role "johndoe", which does not exist. Set pubtrack-backend/.env to a real role (Homebrew: postgresql://${localUser}@localhost:5432/pubtrack — Docker: postgresql://pubtrack:pubtrack@localhost:5432/pubtrack) and run \`unset DATABASE_URL\` in the shell that started the API.`,
  );
}

function readEnvFileValue(key: string): string | undefined {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) {
    return undefined;
  }
  return parseEnvFile(readFileSync(envPath))[key];
}

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const databaseUrl = resolveDatabaseUrl(
    config.DATABASE_URL,
    readEnvFileValue('DATABASE_URL'),
  );
  if (databaseUrl !== config.DATABASE_URL) {
    process.env.DATABASE_URL = databaseUrl;
  }

  const validated = plainToInstance(
    EnvironmentVariables,
    { ...config, DATABASE_URL: databaseUrl },
    {
      exposeDefaultValues: true,
    },
  );
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    const messages = errors
      .flatMap((error) => Object.values(error.constraints ?? {}))
      .join('; ');
    throw new Error(`Invalid environment variables: ${messages}`);
  }

  return { ...config, ...validated };
}
