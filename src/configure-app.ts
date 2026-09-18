import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  const nodeEnv = config.get<string>('NODE_ENV') ?? 'development';
  const isProd = nodeEnv === 'production';

  if (isProd) {
    // Correct client IPs / throttler keys behind reverse proxies.
    const expressApp = app.getHttpAdapter().getInstance() as {
      set?: (key: string, value: unknown) => void;
    };
    expressApp.set?.('trust proxy', 1);
  }

  app.use(
    helmet({
      // Swagger UI needs inline scripts; disable CSP outside production where docs are served.
      contentSecurityPolicy: isProd ? undefined : false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());

  const origins = config.get<string>('CORS_ORIGINS');
  const allowedOrigins = origins
    ? origins
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    : [];

  if (isProd && allowedOrigins.length === 0) {
    throw new Error(
      'CORS_ORIGINS must be set to a comma-separated allowlist in production',
    );
  }

  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
}

export function configureSwagger(app: INestApplication): void {
  const config = app.get(ConfigService);
  const nodeEnv = config.get<string>('NODE_ENV') ?? 'development';
  if (nodeEnv === 'production') {
    return;
  }

  const swaggerConfig = new DocumentBuilder()
    .setTitle('PubTrack API')
    .setDescription('REST API for the PubTrack publishing and library platform')
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth('refresh_token')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, { useGlobalPrefix: false });
}
