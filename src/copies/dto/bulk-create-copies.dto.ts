import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const MAX_BULK_COPIES = 1000;

export class BulkCreateCopiesDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  editionId: string;

  @ApiProperty({
    example: 25,
    minimum: 1,
    maximum: MAX_BULK_COPIES,
    description:
      'Copies to print into the publisher warehouse. Max 1000 per request.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_BULK_COPIES)
  quantity: number;

  @ApiPropertyOptional({ example: 'Spring 2026 hardcover print run' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({
    description: 'Client-generated key so retries do not print a second batch.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  idempotencyKey?: string;
}
