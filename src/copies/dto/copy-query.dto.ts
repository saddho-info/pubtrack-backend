import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { CopyStatus } from '../../../generated/prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class CopyQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  editionId?: string;

  @ApiPropertyOptional({ enum: CopyStatus })
  @IsOptional()
  @IsEnum(CopyStatus)
  status?: CopyStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  libraryId?: string;

  @ApiPropertyOptional({ description: 'Filter by exact copy number.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  copyNumber?: number;
}
