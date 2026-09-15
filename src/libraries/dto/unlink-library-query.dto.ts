import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UnlinkLibraryQueryDto {
  @ApiPropertyOptional({
    description: 'Required for SUPER_ADMIN. Ignored for publisher admins.',
  })
  @IsOptional()
  @IsString()
  publisherId?: string;
}
