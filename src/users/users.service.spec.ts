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
  hashPassword: jest.fn(async (plain: string) => `hashed:${plain}`),
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
});
