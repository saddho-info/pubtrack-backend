import { Module } from '@nestjs/common';
import { ReceivingModule } from '../receiving/receiving.module';
import { SalesModule } from '../sales/sales.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [SalesModule, ReceivingModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
