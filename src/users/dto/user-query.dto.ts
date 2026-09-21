import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class UserQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Restrict to users belonging to this library. SUPER_ADMIN may filter any library; library roles are already scoped to their own org.',
  })
  @IsOptional()
  @IsString()
  libraryId?: string;
}
