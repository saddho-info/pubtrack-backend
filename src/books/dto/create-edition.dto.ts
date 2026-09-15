import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { BookFormat } from '../../../generated/prisma/client';

export class CreateEditionDto {
  @ApiProperty({ example: 'ckxyzbookid' })
  @IsString()
  @IsNotEmpty()
  bookId: string;

  @ApiProperty({
    example: '978-0-306-40615-7',
    description: 'ISBN-13, with or without hyphens. Stored digits-only.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  isbn: string;

  @ApiPropertyOptional({ example: '0-306-40615-2' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  isbn10?: string;

  @ApiProperty({ enum: BookFormat, example: BookFormat.PAPERBACK })
  @IsEnum(BookFormat)
  format: BookFormat;

  @ApiPropertyOptional({
    description: 'Edition-specific title when it differs from the book.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @ApiPropertyOptional({ example: '2024-03-12' })
  @IsOptional()
  @IsDateString()
  publicationDate?: string;

  @ApiPropertyOptional({ example: 312 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50000)
  pageCount?: number;

  @ApiProperty({
    example: 1499,
    description: 'List price in integer cents. Never a float.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  listPriceCents: number;

  @ApiPropertyOptional({ example: 'USD', default: 'USD' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO code' })
  currency?: string;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/covers/silent-pb.jpg',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Matches(/^https?:\/\/.+/i, {
    message: 'coverImageUrl must be an http(s) URL',
  })
  coverImageUrl?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
