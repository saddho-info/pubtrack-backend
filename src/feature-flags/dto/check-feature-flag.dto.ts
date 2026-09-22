import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { CONFIG_KEY_PATTERN } from './create-feature-flag.dto';

export class CheckFeatureFlagDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  @Matches(CONFIG_KEY_PATTERN)
  key: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  publisherId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  libraryId?: string;
}
