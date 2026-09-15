import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { OVERVIEW_PERIODS, type OverviewPeriod } from '../overview.types';

export class OverviewQueryDto {
  @ApiPropertyOptional({
    enum: OVERVIEW_PERIODS,
    default: '30d',
    description: 'Window for sales rankings, top books, and activity.',
  })
  @IsOptional()
  @IsIn(OVERVIEW_PERIODS)
  period?: OverviewPeriod = '30d';

  @ApiPropertyOptional({
    description:
      'Required for SUPER_ADMIN to scope the snapshot to one publisher.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  publisherId?: string;
}
