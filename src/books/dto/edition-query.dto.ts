import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { BookFormat } from '../../../generated/prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class EditionQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Limit to editions of a single book' })
  @IsOptional()
  @IsString()
  bookId?: string;

  @ApiPropertyOptional({ enum: BookFormat })
  @IsOptional()
  @IsEnum(BookFormat)
  format?: BookFormat;
}
