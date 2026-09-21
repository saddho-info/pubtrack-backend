import { Module } from '@nestjs/common';
import { CopiesModule } from '../copies/copies.module';
import { LabelsController } from './labels.controller';
import { LabelsService } from './labels.service';

@Module({
  imports: [CopiesModule],
  controllers: [LabelsController],
  providers: [LabelsService],
})
export class LabelsModule {}
