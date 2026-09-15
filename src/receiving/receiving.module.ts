import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { ReceivingController } from './receiving.controller';
import { ReceivingService } from './receiving.service';

@Module({
  imports: [InventoryModule],
  controllers: [ReceivingController],
  providers: [ReceivingService],
  exports: [ReceivingService],
})
export class ReceivingModule {}
