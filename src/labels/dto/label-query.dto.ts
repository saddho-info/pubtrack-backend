import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { CopyStatus } from '../../../generated/prisma/client';

export const LABEL_FORMATS = ['a4', 'thermal'] as const;
export type LabelFormat = (typeof LABEL_FORMATS)[number];

export class LabelQueryDto {
  @ApiPropertyOptional({ enum: LABEL_FORMATS, default: 'a4' })
  @IsOptional()
  @IsIn(LABEL_FORMATS)
  format: LabelFormat = 'a4';

  @ApiPropertyOptional({
    enum: [...Object.values(CopyStatus), 'all'],
    default: CopyStatus.IN_STOCK_PUBLISHER,
  })
  @IsOptional()
  @IsIn([...Object.values(CopyStatus), 'all'])
  status: CopyStatus | 'all' = CopyStatus.IN_STOCK_PUBLISHER;

  @ApiPropertyOptional({ default: 100, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit: number = 100;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;
}
