import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

export class UpdateThresholdDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  editionId: string;

  @ApiProperty({ example: 5, minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  lowStockThreshold: number;
}
