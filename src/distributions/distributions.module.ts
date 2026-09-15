import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { DistributionsController } from './distributions.controller';
import { DistributionsService } from './distributions.service';

@Module({
  imports: [InventoryModule],
  controllers: [DistributionsController],
  providers: [DistributionsService],
  exports: [DistributionsService],
})
export class DistributionsModule {}
