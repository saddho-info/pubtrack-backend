import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export class LinkLibraryDto {
  @ApiPropertyOptional({
    description: 'Existing library id. Provide libraryId or slug.',
  })
  @ValidateIf((dto: LinkLibraryDto) => !dto.slug)
  @IsString()
  libraryId?: string;

  @ApiPropertyOptional({
    example: 'riverside-public',
    description: 'Existing library slug. Provide libraryId or slug.',
  })
  @ValidateIf((dto: LinkLibraryDto) => !dto.libraryId)
  @IsString()
  slug?: string;

  @ApiPropertyOptional({
    description: 'Required for SUPER_ADMIN. Ignored for publisher admins.',
  })
  @IsOptional()
  @IsString()
  publisherId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
