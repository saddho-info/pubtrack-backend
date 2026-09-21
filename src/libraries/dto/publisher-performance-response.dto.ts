import { ApiProperty } from '@nestjs/swagger';

export class PublisherPerformanceLibraryDto {
  @ApiProperty({ example: 'library-id' })
  id!: string;

  @ApiProperty({ example: 'Library Name' })
  name!: string;

  @ApiProperty({ example: 'library-name' })
  slug!: string;
}

export class PublisherPerformanceRevenueDto {
  @ApiProperty({ example: 'BDT' })
  currency!: string;

  @ApiProperty({ example: 1500000 })
  totalCents!: number;
}

export class PublisherPerformanceSummaryDto {
  @ApiProperty({ example: 120 })
  totalDistributed!: number;

  @ApiProperty({ example: 45 })
  inStock!: number;

  @ApiProperty({ example: 10 })
  inTransit!: number;

  @ApiProperty({ example: 60 })
  sold!: number;

  @ApiProperty({ type: [PublisherPerformanceRevenueDto] })
  revenueByCurrency!: PublisherPerformanceRevenueDto[];
}

export class PublisherPerformanceResponseDto {
  @ApiProperty({ type: PublisherPerformanceLibraryDto })
  library!: PublisherPerformanceLibraryDto;

  @ApiProperty({ type: PublisherPerformanceSummaryDto })
  summary!: PublisherPerformanceSummaryDto;
}
