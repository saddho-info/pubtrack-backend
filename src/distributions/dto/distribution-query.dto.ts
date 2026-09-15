import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { DistributionStatus } from '../../../generated/prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class DistributionQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: DistributionStatus })
  @IsOptional()
  @IsEnum(DistributionStatus)
  status?: DistributionStatus;

  @ApiPropertyOptional({
    description:
      'Inbound shipments a library can receive (DISPATCHED or PARTIALLY_RECEIVED).',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  receivable?: boolean;

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
