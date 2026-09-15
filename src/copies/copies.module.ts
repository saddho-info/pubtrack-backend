import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { CopiesController } from './copies.controller';
import { CopiesService } from './copies.service';
import { QrService } from './qr.service';

@Module({
  imports: [InventoryModule],
  controllers: [CopiesController],
  providers: [CopiesService, QrService],
  exports: [CopiesService, QrService],
})
export class CopiesModule {}
