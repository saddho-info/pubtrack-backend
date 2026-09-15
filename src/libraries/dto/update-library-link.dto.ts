import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateLibraryLinkDto {
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

  @ApiPropertyOptional({
    description: 'Pause or resume the partnership without deleting it.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
