import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthModule } from './auth/auth.module';
import { BooksModule } from './books/books.module';
import { CopiesModule } from './copies/copies.module';
import { validateEnv } from './config/env.validation';
import { DistributionsModule } from './distributions/distributions.module';
import { InventoryModule } from './inventory/inventory.module';
import { LibrariesModule } from './libraries/libraries.module';
import { PrismaModule } from './prisma/prisma.module';
import { PublishersModule } from './publishers/publishers.module';
import { ReceivingModule } from './receiving/receiving.module';
import { SalesModule } from './sales/sales.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnv,
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    PublishersModule,
    LibrariesModule,
    BooksModule,
    CopiesModule,
    InventoryModule,
    DistributionsModule,
    ReceivingModule,
    SalesModule,
    AnalyticsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
