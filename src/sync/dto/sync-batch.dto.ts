import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { SyncTransactionType } from '../../../generated/prisma/client';

export class SyncItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  clientId: string;

  @IsEnum(SyncTransactionType)
  type: SyncTransactionType;

  @IsObject()
  payload: Record<string, unknown>;

  @IsOptional()
  @IsDateString()
  copyUpdatedAt?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  inventoryVersion?: number;
}

export class SyncBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SyncItemDto)
  transactions: SyncItemDto[];
}
