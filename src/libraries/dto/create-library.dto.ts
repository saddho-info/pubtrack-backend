import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateLibraryDto {
  @ApiProperty({ example: 'Riverside Public Library' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({
    example: 'riverside-public',
    description: 'URL-safe unique slug. Generated from name when omitted.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase letters, numbers, and hyphens',
  })
  slug?: string;

  @ApiPropertyOptional({ example: 'desk@riverside.example' })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({ example: '+1-555-0142' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description:
      'Required for SUPER_ADMIN when auto-linking. Ignored for publisher admins (always their org).',
  })
  @IsOptional()
  @IsString()
  publisherId?: string;

  @ApiPropertyOptional({
    description:
      'Notes stored on the publisher↔library partnership when linking.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
