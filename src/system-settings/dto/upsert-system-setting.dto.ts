import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDefined, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertSystemSettingDto {
  @ApiProperty({ description: 'Any valid JSON value' })
  @IsDefined()
  value: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
