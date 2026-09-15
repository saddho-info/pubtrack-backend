import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class BookQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Filter by publisher. SUPER_ADMIN only; publisher users are locked to their org.',
  })
  @IsOptional()
  @IsString()
  publisherId?: string;
}
