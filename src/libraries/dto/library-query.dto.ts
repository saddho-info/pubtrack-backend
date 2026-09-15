import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class LibraryQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'SUPER_ADMIN only: restrict to libraries linked to this publisher.',
  })
  @IsOptional()
  @IsString()
  publisherId?: string;
}
