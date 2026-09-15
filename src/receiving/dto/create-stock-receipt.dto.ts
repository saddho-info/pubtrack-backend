import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CreateStockReceiptItemDto } from './create-stock-receipt-item.dto';

export const MAX_RECEIPT_ITEMS = 500;

export class CreateStockReceiptDto {
  @ApiProperty({
    description: 'Dispatched (or partially received) shipment to confirm.',
  })
  @IsString()
  @IsNotEmpty()
  distributionId: string;

  @ApiPropertyOptional({
    description: 'Required for SUPER_ADMIN. Ignored for library users.',
  })
  @IsOptional()
  @IsString()
  libraryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({
    type: [CreateStockReceiptItemDto],
    description:
      'Copies to mark received or missing. Omitted on confirm receives every remaining in-transit copy.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_RECEIPT_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => CreateStockReceiptItemDto)
  items?: CreateStockReceiptItemDto[];

  @ApiPropertyOptional({
    description: 'Confirm immediately after creating the draft.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;

  @ApiPropertyOptional({
    description:
      'Client-generated key so retries do not create a second receipt. Required when confirm is true.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  idempotencyKey?: string;
}
