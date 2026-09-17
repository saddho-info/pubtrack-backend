import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class ReportQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  libraryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  publisherId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  editionId?: string;
}
