import { Controller, Get, Header, Query, StreamableFile } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '../../generated/prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { ReportQueryDto } from './dto/report-query.dto';
import { ReportsService } from './reports.service';

const READ_ROLES = [
  Role.SUPER_ADMIN,
  Role.PUBLISHER_ADMIN,
  Role.PUBLISHER_STAFF,
  Role.LIBRARY_ADMIN,
  Role.LIBRARY_STAFF,
] as const;

const AUDIT_ROLES = [
  Role.SUPER_ADMIN,
  Role.PUBLISHER_ADMIN,
  Role.PUBLISHER_STAFF,
  Role.LIBRARY_ADMIN,
] as const;

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('sales.csv')
  @Roles(...READ_ROLES)
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'Sales export as CSV' })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="sales.csv"')
  async salesCsv(
    @Query() query: ReportQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.reports.salesCsv(query, user);
  }

  @Get('sales.pdf')
  @Roles(...READ_ROLES)
  @ApiProduces('application/pdf')
  @ApiOkResponse({ description: 'Sales export as PDF' })
  async salesPdf(
    @Query() query: ReportQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const body = await this.reports.salesPdf(query, user);
    return new StreamableFile(body, {
      type: 'application/pdf',
      disposition: 'attachment; filename="sales.pdf"',
    });
  }

  @Get('inventory.csv')
  @Roles(...READ_ROLES)
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'Inventory export as CSV' })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="inventory.csv"')
  async inventoryCsv(
    @Query() query: ReportQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.reports.inventoryCsv(query, user);
  }

  @Get('inventory.pdf')
  @Roles(...READ_ROLES)
  @ApiProduces('application/pdf')
  @ApiOkResponse({ description: 'Inventory export as PDF' })
  async inventoryPdf(
    @Query() query: ReportQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const body = await this.reports.inventoryPdf(query, user);
    return new StreamableFile(body, {
      type: 'application/pdf',
      disposition: 'attachment; filename="inventory.pdf"',
    });
  }

  @Get('receipts.csv')
  @Roles(...READ_ROLES)
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'Stock receipt export as CSV' })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="receipts.csv"')
  async receiptsCsv(
    @Query() query: ReportQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.reports.receiptsCsv(query, user);
  }

  @Get('receipts.pdf')
  @Roles(...READ_ROLES)
  @ApiProduces('application/pdf')
  @ApiOkResponse({ description: 'Stock receipt export as PDF' })
  async receiptsPdf(
    @Query() query: ReportQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const body = await this.reports.receiptsPdf(query, user);
    return new StreamableFile(body, {
      type: 'application/pdf',
      disposition: 'attachment; filename="receipts.pdf"',
    });
  }

  @Get('audit-logs.csv')
  @Roles(...AUDIT_ROLES)
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'Audit log export as CSV' })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="audit-logs.csv"')
  async auditLogsCsv(
    @Query() query: ReportQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.reports.auditLogsCsv(query, user);
  }

  @Get('audit-logs.pdf')
  @Roles(...AUDIT_ROLES)
  @ApiProduces('application/pdf')
  @ApiOkResponse({ description: 'Audit log export as PDF' })
  async auditLogsPdf(
    @Query() query: ReportQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const body = await this.reports.auditLogsPdf(query, user);
    return new StreamableFile(body, {
      type: 'application/pdf',
      disposition: 'attachment; filename="audit-logs.pdf"',
    });
  }
}
