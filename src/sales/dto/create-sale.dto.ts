import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CreateSaleItemDto } from './create-sale-item.dto';

export const MAX_SALE_ITEMS = 20;

export class CreateSaleDto {
  @ApiProperty({ type: [CreateSaleItemDto], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SALE_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items: CreateSaleItemDto[];

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
    description:
      'Client-generated key so retries do not create a second sale. Prefer the Idempotency-Key header.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  idempotencyKey?: string;
}
