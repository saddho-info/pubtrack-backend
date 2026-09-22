import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { BooksModule } from './books/books.module';
import { CopiesModule } from './copies/copies.module';
import { validateEnv } from './config/env.validation';
import { DistributionsModule } from './distributions/distributions.module';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module';
import { InventoryModule } from './inventory/inventory.module';
import { LabelsModule } from './labels/labels.module';
import { LibrariesModule } from './libraries/libraries.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { PublishersModule } from './publishers/publishers.module';
import { ReceivingModule } from './receiving/receiving.module';
import { ReportsModule } from './reports/reports.module';
import { SalesModule } from './sales/sales.module';
import { SyncModule } from './sync/sync.module';
import { SystemSettingsModule } from './system-settings/system-settings.module';
import { UsersModule } from './users/users.module';

const redisUrl = process.env.REDIS_URL?.trim();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnv,
    }),
    ...(redisUrl
      ? [
          BullModule.forRoot({
            connection: { url: redisUrl },
          }),
        ]
      : []),
    PrismaModule,
    AuthModule,
    UsersModule,
    PublishersModule,
    LibrariesModule,
    BooksModule,
    CopiesModule,
    LabelsModule,
    InventoryModule,
    DistributionsModule,
    ReceivingModule,
    SalesModule,
    AnalyticsModule,
    SyncModule,
    NotificationsModule,
    AuditModule,
    ReportsModule,
    FeatureFlagsModule,
    SystemSettingsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
