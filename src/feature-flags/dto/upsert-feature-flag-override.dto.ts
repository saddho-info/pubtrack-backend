import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { FeatureFlagScope } from '../../../generated/prisma/client';

export class UpsertFeatureFlagOverrideDto {
  @ApiProperty({ enum: FeatureFlagScope })
  @IsEnum(FeatureFlagScope)
  scope: FeatureFlagScope;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  publisherId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  libraryId?: string;

  @ApiProperty()
  @IsBoolean()
  enabled: boolean;
}
