import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export const CONFIG_KEY_PATTERN = /^[a-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/;

export class CreateFeatureFlagDto {
  @ApiProperty({ example: 'sales.bulkEntry' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @Matches(CONFIG_KEY_PATTERN)
  key: string;

  @ApiProperty({ example: 'Bulk sale entry' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
