import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ReceiptDiscrepancy } from '../../../generated/prisma/client';

export class CreateStockReceiptItemDto {
  @ApiPropertyOptional({
    description: 'Physical copy id. Provide copyId or qrToken.',
  })
  @ValidateIf((o: CreateStockReceiptItemDto) => !o.qrToken)
  @IsString()
  @IsNotEmpty()
  copyId?: string;

  @ApiPropertyOptional({
    description: 'Opaque QR token mapped to a copy. Provide copyId or qrToken.',
  })
  @ValidateIf((o: CreateStockReceiptItemDto) => !o.copyId)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  qrToken?: string;

  @ApiPropertyOptional({
    description: 'Whether this copy arrived. Defaults to true.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  received?: boolean;

  @ApiPropertyOptional({
    enum: ReceiptDiscrepancy,
    description:
      'MISSING or DAMAGED when the line does not match the shipment.',
  })
  @IsOptional()
  @IsEnum(ReceiptDiscrepancy)
  discrepancy?: ReceiptDiscrepancy;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
