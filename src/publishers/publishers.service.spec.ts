import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  libraryAdminUser,
  publisherAdminUser,
  superAdminUser,
} from '../common/testing/auth-user.fixture';
import { PrismaService } from '../prisma/prisma.service';
import { PublishersService } from './publishers.service';

describe('PublishersService', () => {
  let service: PublishersService;
  const prisma = {
    publisher: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    publisherLibrary: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublishersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(PublishersService);
  });

  it('creates a publisher and slugifies the name when slug is omitted', async () => {
    prisma.publisher.create.mockResolvedValue({
      id: 'pub_1',
      name: 'Northwind Press',
      slug: 'northwind-press',
    });

    await service.create({ name: 'Northwind Press' });

    expect(prisma.publisher.create).toHaveBeenCalledTimes(1);
    const calls = prisma.publisher.create.mock.calls as Array<
      [{ data: { name: string; slug: string; isActive: boolean } }]
    >;
    expect(calls[0]?.[0].data).toMatchObject({
      name: 'Northwind Press',
      slug: 'northwind-press',
      isActive: true,
    });
  });

  it('returns a paginated list scoped to the caller', async () => {
    const rows = [{ id: 'pub_1', name: 'Northwind Press' }];
    prisma.$transaction.mockResolvedValue([rows, 1]);

    await expect(
      service.findAll({ page: 1, limit: 20 }, superAdminUser),
    ).resolves.toEqual({
      data: rows,
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  });

  it('throws NotFoundException when the publisher is missing', async () => {
    prisma.publisher.findUnique.mockResolvedValue(null);

    await expect(
      service.findOne('missing', superAdminUser),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('forbids a publisher admin from reading another publisher', async () => {
    prisma.publisher.findUnique.mockResolvedValue({ id: 'pub_other' });

    await expect(
      service.findOne('pub_other', publisherAdminUser('pub_1')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets a library admin read a publisher linked to their library', async () => {
    prisma.publisher.findUnique.mockResolvedValue({ id: 'pub_1' });
    prisma.publisherLibrary.findUnique.mockResolvedValue({ isActive: true });

    await expect(
      service.findOne('pub_1', libraryAdminUser('lib_1')),
    ).resolves.toEqual({ id: 'pub_1' });
  });

  it('hides an unlinked publisher from a library admin', async () => {
    prisma.publisher.findUnique.mockResolvedValue({ id: 'pub_1' });
    prisma.publisherLibrary.findUnique.mockResolvedValue(null);

    await expect(
      service.findOne('pub_1', libraryAdminUser('lib_1')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('hides a paused partnership from a library admin', async () => {
    prisma.publisher.findUnique.mockResolvedValue({ id: 'pub_1' });
    prisma.publisherLibrary.findUnique.mockResolvedValue({ isActive: false });

    await expect(
      service.findOne('pub_1', libraryAdminUser('lib_1')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates an existing publisher', async () => {
    prisma.publisher.findUnique.mockResolvedValue({ id: 'pub_1' });
    prisma.publisher.update.mockResolvedValue({
      id: 'pub_1',
      name: 'Renamed Press',
    });

    await expect(
      service.update('pub_1', { name: 'Renamed Press' }, superAdminUser),
    ).resolves.toEqual({ id: 'pub_1', name: 'Renamed Press' });
  });
});
