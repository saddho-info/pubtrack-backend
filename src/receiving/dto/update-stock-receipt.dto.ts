import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CreateStockReceiptItemDto } from './create-stock-receipt-item.dto';
import { MAX_RECEIPT_ITEMS } from './create-stock-receipt.dto';

export class UpdateStockReceiptDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ type: [CreateStockReceiptItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_RECEIPT_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => CreateStockReceiptItemDto)
  items?: CreateStockReceiptItemDto[];
}
