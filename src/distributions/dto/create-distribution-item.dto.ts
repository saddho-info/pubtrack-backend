import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export const MAX_DISTRIBUTION_ITEM_QTY = 1000;

export class CreateDistributionItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  editionId: string;

  @ApiProperty({
    example: 8,
    minimum: 1,
    maximum: MAX_DISTRIBUTION_ITEM_QTY,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_DISTRIBUTION_ITEM_QTY)
  quantity: number;

  @ApiPropertyOptional({
    description:
      'Specific warehouse copies to allocate. Length must equal quantity when set.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(MAX_DISTRIBUTION_ITEM_QTY)
  copyIds?: string[];
}
