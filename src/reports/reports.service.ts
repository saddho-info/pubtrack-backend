import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../common/types/auth-user';
import { toCsv } from '../common/utils/csv';
import { rowsToPdfLines, toSimplePdf } from '../common/utils/pdf';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { ReceivingService } from '../receiving/receiving.service';
import { SalesService } from '../sales/sales.service';
import { ReportQueryDto } from './dto/report-query.dto';

const PAGE_SIZE = 100;
const MAX_PAGES = 50;

@Injectable()
export class ReportsService {
  constructor(
    private readonly sales: SalesService,
    private readonly inventory: InventoryService,
    private readonly receiving: ReceivingService,
    private readonly audit: AuditService,
  ) {}

  async salesCsv(query: ReportQueryDto, user: AuthUser) {
    const { headers, rows } = await this.salesTable(query, user);
    return toCsv(headers, rows);
  }

  async salesPdf(query: ReportQueryDto, user: AuthUser) {
    const { headers, rows } = await this.salesTable(query, user);
    return toSimplePdf('PubTrack Sales Report', rowsToPdfLines(headers, rows));
  }

  async inventoryCsv(query: ReportQueryDto, user: AuthUser) {
    const { headers, rows } = await this.inventoryTable(query, user);
    return toCsv(headers, rows);
  }

  async inventoryPdf(query: ReportQueryDto, user: AuthUser) {
    const { headers, rows } = await this.inventoryTable(query, user);
    return toSimplePdf(
      'PubTrack Inventory Report',
      rowsToPdfLines(headers, rows),
    );
  }

  async receiptsCsv(query: ReportQueryDto, user: AuthUser) {
    const { headers, rows } = await this.receiptsTable(query, user);
    return toCsv(headers, rows);
  }

  async receiptsPdf(query: ReportQueryDto, user: AuthUser) {
    const { headers, rows } = await this.receiptsTable(query, user);
    return toSimplePdf(
      'PubTrack Receipts Report',
      rowsToPdfLines(headers, rows),
    );
  }

  async auditLogsCsv(query: ReportQueryDto, user: AuthUser) {
    const { headers, rows } = await this.auditTable(query, user);
    return toCsv(headers, rows);
  }

  async auditLogsPdf(query: ReportQueryDto, user: AuthUser) {
    const { headers, rows } = await this.auditTable(query, user);
    return toSimplePdf(
      'PubTrack Audit Log Report',
      rowsToPdfLines(headers, rows),
    );
  }

  private async salesTable(query: ReportQueryDto, user: AuthUser) {
    const headers = [
      'sale_code',
      'sold_at',
      'library',
      'title',
      'isbn',
      'copy_number',
      'unit_price',
      'currency',
    ];
    const rows: Array<Array<unknown>> = [];

    await this.forEachPage(async (page) => {
      const result = await this.sales.findAll(
        {
          ...query,
          page,
          limit: PAGE_SIZE,
          libraryId: query.libraryId,
          publisherId: query.publisherId,
          editionId: query.editionId,
        },
        user,
      );
      for (const sale of result.data) {
        for (const item of sale.items) {
          rows.push([
            sale.code,
            sale.soldAt,
            sale.library?.name ?? sale.libraryId,
            item.edition.book.title,
            item.edition.isbn,
            item.copy.copyNumber,
            item.unitPriceCents / 100,
            sale.currency,
          ]);
        }
      }
      return result.meta.totalPages;
    });

    return { headers, rows };
  }

  private async inventoryTable(query: ReportQueryDto, user: AuthUser) {
    const headers = [
      'title',
      'isbn',
      'format',
      'warehouse_on_hand',
      'library_on_hand',
      'in_transit',
      'sold',
      'low_stock',
    ];
    const rows: Array<Array<unknown>> = [];

    await this.forEachPage(async (page) => {
      const result = await this.inventory.findAll(
        {
          ...query,
          page,
          limit: PAGE_SIZE,
          libraryId: query.libraryId,
          publisherId: query.publisherId,
          editionId: query.editionId,
        },
        user,
      );
      for (const row of result.data) {
        rows.push([
          row.book.title,
          row.isbn,
          row.format,
          row.warehouseOnHand,
          row.libraryOnHand,
          row.inTransit,
          row.sold,
          row.isLowStock ? 'yes' : 'no',
        ]);
      }
      return result.meta.totalPages;
    });

    return { headers, rows };
  }

  private async receiptsTable(query: ReportQueryDto, user: AuthUser) {
    const headers = [
      'receipt_code',
      'status',
      'shipment',
      'library',
      'received',
      'discrepancies',
      'confirmed_at',
    ];
    const rows: Array<Array<unknown>> = [];

    await this.forEachPage(async (page) => {
      const result = await this.receiving.findAll(
        {
          ...query,
          page,
          limit: PAGE_SIZE,
          libraryId: query.libraryId,
        },
        user,
      );
      for (const row of result.data) {
        rows.push([
          row.code,
          row.status,
          row.distribution?.code ?? row.distributionId,
          row.library?.name ?? row.libraryId,
          row.receivedCount,
          row.discrepancyCount,
          row.confirmedAt,
        ]);
      }
      return result.meta.totalPages;
    });

    return { headers, rows };
  }

  private async auditTable(query: ReportQueryDto, user: AuthUser) {
    const headers = [
      'created_at',
      'action',
      'entity_type',
      'entity_id',
      'actor_email',
      'method',
      'path',
      'status_code',
      'ip',
    ];
    const rows: Array<Array<unknown>> = [];

    await this.forEachPage(async (page) => {
      const result = await this.audit.findAll(
        {
          page,
          limit: PAGE_SIZE,
          search: query.search,
          entityType: query.entityType,
          entityId: query.entityId,
          action: query.action,
        },
        user,
      );
      for (const row of result.data) {
        rows.push([
          row.createdAt,
          row.action,
          row.entityType,
          row.entityId,
          row.actor?.email ?? '',
          row.method,
          row.path,
          row.statusCode,
          row.ip,
        ]);
      }
      return result.meta.totalPages;
    });

    return { headers, rows };
  }

  private async forEachPage(
    fetchPage: (page: number) => Promise<number>,
  ): Promise<void> {
    let page = 1;
    let totalPages = 1;
    while (page <= totalPages && page <= MAX_PAGES) {
      totalPages = await fetchPage(page);
      if (totalPages <= 0) {
        break;
      }
      page += 1;
    }
  }
}
