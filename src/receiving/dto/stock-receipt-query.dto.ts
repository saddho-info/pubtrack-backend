import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { StockReceiptStatus } from '../../../generated/prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class StockReceiptQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: StockReceiptStatus })
  @IsOptional()
  @IsEnum(StockReceiptStatus)
  status?: StockReceiptStatus;

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
  distributionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  editionId?: string;
}
