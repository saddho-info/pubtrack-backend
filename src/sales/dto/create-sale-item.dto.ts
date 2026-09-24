import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateSaleItemDto {
  @ApiPropertyOptional({
    description: 'Physical copy id. Provide copyId or qrToken.',
  })
  @ValidateIf((o: CreateSaleItemDto) => !o.qrToken)
  @IsString()
  @IsNotEmpty()
  copyId?: string;

  @ApiPropertyOptional({
    description: 'Opaque QR token mapped to a copy. Provide copyId or qrToken.',
  })
  @ValidateIf((o: CreateSaleItemDto) => !o.copyId)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  qrToken?: string;

  @ApiPropertyOptional({
    description:
      'Unit price in cents. Defaults to the edition list price when omitted.',
    minimum: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  unitPriceCents?: number;

  @ApiPropertyOptional({
    description:
      'Number of in-stock copies of this edition to sell. The scanned copy is the first unit. Defaults to 1.',
    minimum: 1,
    maximum: 100,
    default: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  quantity?: number;
}
