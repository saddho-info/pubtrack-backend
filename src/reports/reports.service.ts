import { Injectable } from '@nestjs/common';
import { InventoryHolderType } from '../../generated/prisma/client';
import {
  AuthUser,
  isLibraryRole,
  isPublisherRole,
  isSuperAdmin,
} from '../common/types/auth-user';
import { toCsv } from '../common/utils/csv';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReceivingService } from '../receiving/receiving.service';
import { SalesService } from '../sales/sales.service';
import { ReportQueryDto } from './dto/report-query.dto';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sales: SalesService,
    private readonly inventory: InventoryService,
    private readonly receiving: ReceivingService,
  ) {}

  async salesCsv(query: ReportQueryDto, user: AuthUser) {
    const result = await this.sales.findAll(
      { ...query, page: 1, limit: 100 },
      user,
    );
    const rows = result.data.flatMap((sale) =>
      sale.items.map((item) => [
        sale.code,
        sale.soldAt,
        sale.library?.name ?? sale.libraryId,
        item.edition.book.title,
        item.edition.isbn,
        item.copy.copyNumber,
        item.unitPriceCents / 100,
        sale.currency,
      ]),
    );
    return toCsv(
      [
        'sale_code',
        'sold_at',
        'library',
        'title',
        'isbn',
        'copy_number',
        'unit_price',
        'currency',
      ],
      rows,
    );
  }

  async inventoryCsv(query: ReportQueryDto, user: AuthUser) {
    const result = await this.inventory.findAll(
      { ...query, page: 1, limit: 100 },
      user,
    );
    const rows = result.data.map((row) => [
      row.book.title,
      row.isbn,
      row.format,
      row.warehouseOnHand,
      row.libraryOnHand,
      row.inTransit,
      row.sold,
      row.isLowStock ? 'yes' : 'no',
    ]);
    return toCsv(
      [
        'title',
        'isbn',
        'format',
        'warehouse_on_hand',
        'library_on_hand',
        'in_transit',
        'sold',
        'low_stock',
      ],
      rows,
    );
  }

  async receiptsCsv(query: ReportQueryDto, user: AuthUser) {
    const result = await this.receiving.findAll(
      { ...query, page: 1, limit: 100 },
      user,
    );
    const rows = result.data.map((row) => [
      row.code,
      row.status,
      row.distribution?.code ?? row.distributionId,
      row.library?.name ?? row.libraryId,
      row.receivedCount,
      row.discrepancyCount,
      row.confirmedAt,
    ]);
    return toCsv(
      [
        'receipt_code',
        'status',
        'shipment',
        'library',
        'received',
        'discrepancies',
        'confirmed_at',
      ],
      rows,
    );
  }

  holderLabel(user: AuthUser) {
    if (isSuperAdmin(user.role)) {
      return InventoryHolderType.PUBLISHER;
    }
    if (isPublisherRole(user.role)) {
      return InventoryHolderType.PUBLISHER;
    }
    if (isLibraryRole(user.role)) {
      return InventoryHolderType.LIBRARY;
    }
    return InventoryHolderType.PUBLISHER;
  }
}
