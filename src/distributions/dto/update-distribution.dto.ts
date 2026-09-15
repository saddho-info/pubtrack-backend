import { ApiPropertyOptional } from '@nestjs/swagger';
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
import { CreateDistributionItemDto } from './create-distribution-item.dto';
import { MAX_DISTRIBUTION_ITEMS } from './create-distribution.dto';

export class UpdateDistributionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  libraryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ type: [CreateDistributionItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_DISTRIBUTION_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => CreateDistributionItemDto)
  items?: CreateDistributionItemDto[];
}
