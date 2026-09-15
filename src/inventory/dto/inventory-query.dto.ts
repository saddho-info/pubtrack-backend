import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { InventoryHolderType } from '../../../generated/prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class InventoryQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  editionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  publisherId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  libraryId?: string;

  @ApiPropertyOptional({ enum: InventoryHolderType })
  @IsOptional()
  @IsEnum(InventoryHolderType)
  holderType?: InventoryHolderType;

  @ApiPropertyOptional({
    description:
      'Only editions whose warehouse (or scoped holding) is at or below threshold.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  lowStock?: boolean;
}
