import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RefreshDto {
  @ApiPropertyOptional({
    description:
      'Refresh token. Optional when sent as the refresh_token httpOnly cookie.',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
