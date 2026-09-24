import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '../../generated/prisma/client';
import {
  libraryAdminUser,
  publisherAdminUser,
  superAdminUser,
} from '../common/testing/auth-user.fixture';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

jest.mock('../common/utils/password', () => ({
  hashPassword: jest.fn((plain: string) => Promise.resolve(`hashed:${plain}`)),
}));

const staff = {
  id: 'user_ps',
  email: 'nathan.k@example.net',
  passwordHash: 'hashed',
  firstName: 'Pat',
  lastName: 'Staff',
  role: Role.PUBLISHER_STAFF,
  isActive: true,
  refreshTokenHash: null,
  publisherId: 'pub_1',
  libraryId: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('UsersService', () => {
  let service: UsersService;
  const prisma = {
    user: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    refreshSession: {
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(UsersService);
  });

  it('lets a publisher admin create staff in their org', async () => {
    prisma.user.create.mockResolvedValue(staff);

    const created = await service.create(
      {
        email: 'nathan.k@example.net',
        password: 'ChangeMe123!',
        firstName: 'Pat',
        lastName: 'Staff',
        role: Role.PUBLISHER_STAFF,
        publisherId: 'pub_1',
      },
      publisherAdminUser('pub_1'),
    );

    expect(created.email).toBe('nathan.k@example.net');
    expect(created).not.toHaveProperty('passwordHash');
  });

  it('blocks a publisher admin from creating a library user', async () => {
    await expect(
      service.create(
        {
          email: 'desk@example.com',
          password: 'ChangeMe123!',
          firstName: 'Lib',
          lastName: 'Staff',
          role: Role.LIBRARY_STAFF,
          libraryId: 'lib_1',
        },
        publisherAdminUser('pub_1'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks cross-tenant user reads', async () => {
    prisma.user.findUnique.mockResolvedValue(staff);
    await expect(
      service.findOne('user_ps', libraryAdminUser('lib_1')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows SUPER_ADMIN to read any user', async () => {
    prisma.user.findUnique.mockResolvedValue(staff);
    await expect(
      service.findOne('user_ps', superAdminUser),
    ).resolves.toMatchObject({ id: 'user_ps', email: 'nathan.k@example.net' });
  });

  it('lets SUPER_ADMIN filter users by libraryId', async () => {
    const libraryUser = {
      ...staff,
      id: 'user_la',
      email: 'admin@library.example',
      role: Role.LIBRARY_ADMIN,
      publisherId: null,
      libraryId: 'lib_1',
    };
    prisma.$transaction.mockResolvedValue([[libraryUser], 1]);

    const result = await service.findAll(
      { page: 1, limit: 20, libraryId: 'lib_1' },
      superAdminUser,
    );

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.user.findMany).toHaveBeenCalled();
    expect(result.data).toHaveLength(1);
    expect(result.data[0].email).toBe('admin@library.example');
  });

  it('blocks a library admin from listing another library via libraryId', async () => {
    await expect(
      service.findAll(
        { page: 1, limit: 20, libraryId: 'lib_other' },
        libraryAdminUser('lib_1'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets SUPER_ADMIN create a library admin with libraryId', async () => {
    const libraryAdmin = {
      ...staff,
      id: 'user_la',
      email: 'owner@library.example',
      role: Role.LIBRARY_ADMIN,
      publisherId: null,
      libraryId: 'lib_1',
    };
    prisma.user.create.mockResolvedValue(libraryAdmin);

    const created = await service.create(
      {
        email: 'owner@library.example',
        password: 'ChangeMe123!',
        firstName: 'Lib',
        lastName: 'Owner',
        role: Role.LIBRARY_ADMIN,
        libraryId: 'lib_1',
      },
      superAdminUser,
    );

    expect(created.role).toBe(Role.LIBRARY_ADMIN);
    expect(created.libraryId).toBe('lib_1');
  });

  it('soft-deletes a scoped user and revokes their refresh sessions', async () => {
    const deactivated = { ...staff, isActive: false };
    prisma.user.findUnique.mockResolvedValue(staff);
    prisma.user.update.mockResolvedValue(deactivated);
    prisma.refreshSession.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(async (ops: Promise<unknown>[]) =>
      Promise.all(ops),
    );

    const result = await service.softDelete(
      staff.id,
      publisherAdminUser('pub_1'),
    );

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: staff.id },
      data: { isActive: false, refreshTokenHash: null },
    });
    expect(prisma.refreshSession.updateMany).toHaveBeenCalledWith({
      where: { userId: staff.id, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(result.isActive).toBe(false);
  });
});
