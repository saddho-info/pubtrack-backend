import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateBookDto {
  @ApiProperty({ example: 'The Silent Archive' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title: string;

  @ApiPropertyOptional({ example: 'A Northwind Press mystery' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  subtitle?: string;

  @ApiProperty({
    example: 'Lina Chowdhury',
    description: 'Comma-separated author names.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  authors: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  description?: string;

  @ApiPropertyOptional({ example: 'en', default: 'en' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(16)
  language?: string;

  @ApiPropertyOptional({ example: 'Mystery' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/covers/silent.jpg' })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Matches(/^https?:\/\/.+/i, {
    message: 'coverImageUrl must be an http(s) URL',
  })
  coverImageUrl?: string;

  @ApiPropertyOptional({
    example: 'the-silent-archive',
    description:
      'URL-safe slug unique per publisher. Generated from title when omitted.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase letters, numbers, and hyphens',
  })
  slug?: string;

  @ApiPropertyOptional({
    description: 'Required for SUPER_ADMIN. Ignored for publisher users.',
  })
  @IsOptional()
  @IsString()
  publisherId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
