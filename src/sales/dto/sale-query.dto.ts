import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class SaleQueryDto extends PaginationQueryDto {
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

  @ApiPropertyOptional({
    description: 'Filter sales that include this physical copy.',
  })
  @IsOptional()
  @IsString()
  copyId?: string;
}
