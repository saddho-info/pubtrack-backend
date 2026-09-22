import { Test, TestingModule } from '@nestjs/testing';
import { publisherAdminUser } from '../common/testing/auth-user.fixture';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  let service: AuditService;
  const prisma = {
    auditLog: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.auditLog.create.mockResolvedValue({ id: 'audit_1' });
    prisma.auditLog.findMany.mockResolvedValue([
      {
        id: 'audit_1',
        action: 'POST Sale',
        entityType: 'Sale',
        entityId: 'sale_1',
        method: 'POST',
        path: '/api/v1/sales',
        statusCode: 201,
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
        actor: {
          id: 'user_1',
          email: 'a@example.com',
          firstName: 'A',
          lastName: 'B',
          role: 'LIBRARY_STAFF',
        },
      },
    ]);
    prisma.auditLog.count.mockResolvedValue(1);
    prisma.$transaction.mockImplementation(async (ops: unknown[]) =>
      Promise.all(ops as Promise<unknown>[]),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(AuditService);
  });

  it('writes an audit row', async () => {
    await service.write({
      actorUserId: 'user_1',
      action: 'POST Sale',
      entityType: 'Sale',
      entityId: 'sale_1',
      method: 'POST',
      path: '/api/v1/sales',
      statusCode: 201,
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'POST Sale',
          entityType: 'Sale',
          entityId: 'sale_1',
        }),
      }),
    );
  });

  it('lists audit logs scoped to the publisher org', async () => {
    const result = await service.findAll(
      { page: 1, limit: 20 },
      publisherAdminUser('pub_1'),
    );
    expect(result.data).toHaveLength(1);
    expect(result.meta.total).toBe(1);
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { actor: { publisherId: 'pub_1' } },
      }),
    );
  });
});
