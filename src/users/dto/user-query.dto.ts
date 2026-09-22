import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Role } from '../../../generated/prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class UserQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Restrict to users belonging to this publisher. SUPER_ADMIN may filter any publisher.',
  })
  @IsOptional()
  @IsString()
  publisherId?: string;

  @ApiPropertyOptional({
    description:
      'Restrict to users belonging to this library. SUPER_ADMIN may filter any library; library roles are already scoped to their own org.',
  })
  @IsOptional()
  @IsString()
  libraryId?: string;

  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
