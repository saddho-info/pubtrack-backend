import { ApiProperty } from '@nestjs/swagger';
import { BookFormat } from '../../../generated/prisma/client';

export class CurrencyRevenueDto {
  @ApiProperty({ example: 'USD' })
  currency!: string;

  @ApiProperty({ example: 10500 })
  totalCents!: number;
}

export class LibraryPerformanceBookDto {
  @ApiProperty({ example: 'book-id' })
  id!: string;

  @ApiProperty({ example: 'The Silent Archive' })
  title!: string;

  @ApiProperty({ example: 'Author Name' })
  authors!: string;

  @ApiProperty({ example: 'publisher-id' })
  publisherId!: string;
}

export class LibraryPerformanceEditionDto {
  @ApiProperty({ example: 'edition-id' })
  id!: string;

  @ApiProperty({ example: 'book-id' })
  bookId!: string;

  @ApiProperty({ example: null, nullable: true, type: String })
  title!: string | null;

  @ApiProperty({ enum: BookFormat, example: BookFormat.HARDCOVER })
  format!: BookFormat;

  @ApiProperty({ example: '9781234567890' })
  isbn!: string;

  @ApiProperty({ example: null, nullable: true, type: String })
  isbn10!: string | null;

  @ApiProperty({ example: 1500 })
  listPriceCents!: number;

  @ApiProperty({ example: 'USD' })
  currency!: string;
}

export class LibraryPerformanceSummaryDto {
  @ApiProperty({ example: 2 })
  libraryCount!: number;

  @ApiProperty({ example: 20 })
  totalDistributed!: number;

  @ApiProperty({ example: 11 })
  inStock!: number;

  @ApiProperty({ example: 2 })
  inTransit!: number;

  @ApiProperty({ example: 7 })
  sold!: number;

  @ApiProperty({ type: [CurrencyRevenueDto] })
  revenueByCurrency!: CurrencyRevenueDto[];
}

export class LibraryPerformanceLibraryDto {
  @ApiProperty({ example: 'library-id-1' })
  id!: string;

  @ApiProperty({ example: 'Riverside Public Library' })
  name!: string;

  @ApiProperty({ example: 'riverside-public-library' })
  slug!: string;
}

export class LibraryPerformanceRowDto {
  @ApiProperty({ type: LibraryPerformanceLibraryDto })
  library!: LibraryPerformanceLibraryDto;

  @ApiProperty({ example: 12 })
  totalDistributed!: number;

  @ApiProperty({ example: 7 })
  inStock!: number;

  @ApiProperty({ example: 1 })
  inTransit!: number;

  @ApiProperty({ example: 4 })
  sold!: number;

  @ApiProperty({ type: [CurrencyRevenueDto] })
  revenueByCurrency!: CurrencyRevenueDto[];
}

export class LibraryPerformanceResponseDto {
  @ApiProperty({ type: LibraryPerformanceBookDto })
  book!: LibraryPerformanceBookDto;

  @ApiProperty({ type: LibraryPerformanceEditionDto })
  edition!: LibraryPerformanceEditionDto;

  @ApiProperty({ type: LibraryPerformanceSummaryDto })
  summary!: LibraryPerformanceSummaryDto;

  @ApiProperty({ type: [LibraryPerformanceRowDto] })
  libraries!: LibraryPerformanceRowDto[];
}
