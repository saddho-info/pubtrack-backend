import { Test, TestingModule } from '@nestjs/testing';
import { publisherAdminUser } from '../common/testing/auth-user.fixture';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { ReceivingService } from '../receiving/receiving.service';
import { SalesService } from '../sales/sales.service';
import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  let service: ReportsService;
  const sales = {
    findAll: jest.fn(),
  };
  const inventory = {
    findAll: jest.fn(),
  };
  const receiving = {
    findAll: jest.fn(),
  };
  const audit = {
    findAll: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    sales.findAll.mockResolvedValue({
      data: [
        {
          code: 'S-1',
          soldAt: new Date('2026-09-01T12:00:00.000Z'),
          libraryId: 'lib_1',
          library: { name: 'Riverside' },
          currency: 'USD',
          items: [
            {
              unitPriceCents: 1999,
              edition: {
                isbn: '9780000000001',
                book: { title: 'Silent Archive' },
              },
              copy: { copyNumber: 1 },
            },
          ],
        },
      ],
      meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
    });
    inventory.findAll.mockResolvedValue({
      data: [
        {
          book: { title: 'Silent Archive' },
          isbn: '9780000000001',
          format: 'HARDCOVER',
          warehouseOnHand: 10,
          libraryOnHand: 2,
          inTransit: 1,
          sold: 3,
          isLowStock: false,
        },
      ],
      meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
    });
    receiving.findAll.mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 100, total: 0, totalPages: 0 },
    });
    audit.findAll.mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 100, total: 0, totalPages: 0 },
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: SalesService, useValue: sales },
        { provide: InventoryService, useValue: inventory },
        { provide: ReceivingService, useValue: receiving },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(ReportsService);
  });

  it('exports sales as CSV', async () => {
    const csv = await service.salesCsv({}, publisherAdminUser('pub_1'));
    expect(csv).toContain('sale_code,sold_at,library,title');
    expect(csv).toContain('S-1');
    expect(csv).toContain('Silent Archive');
    expect(csv).toContain('19.99');
  });

  it('exports inventory as a PDF buffer', async () => {
    const pdf = await service.inventoryPdf({}, publisherAdminUser('pub_1'));
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
  });
});
