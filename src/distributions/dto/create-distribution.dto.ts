import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CreateDistributionItemDto } from './create-distribution-item.dto';

export const MAX_DISTRIBUTION_ITEMS = 50;

export class CreateDistributionDto {
  @ApiProperty({
    description: 'Linked partner library that will receive stock.',
  })
  @IsString()
  @IsNotEmpty()
  libraryId: string;

  @ApiPropertyOptional({
    description: 'Required for SUPER_ADMIN. Ignored for publisher users.',
  })
  @IsOptional()
  @IsString()
  publisherId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiProperty({ type: [CreateDistributionItemDto], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_DISTRIBUTION_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => CreateDistributionItemDto)
  items: CreateDistributionItemDto[];

  @ApiPropertyOptional({
    description: 'Dispatch immediately after creating the draft.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  dispatch?: boolean;

  @ApiPropertyOptional({
    description:
      'Client-generated key so retries do not create a second shipment.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  idempotencyKey?: string;
}
