import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  libraryAdminUser,
  publisherAdminUser,
  superAdminUser,
} from '../common/testing/auth-user.fixture';
import { Role } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LibrariesService } from './libraries.service';

const libraryRow = {
  id: 'lib_1',
  name: 'Riverside Public',
  slug: 'riverside-public',
  email: 'desk@riverside.example',
  phone: null,
  address: null,
  isActive: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  _count: { users: 1 },
};

const linkRow = {
  id: 'link_1',
  publisherId: 'pub_1',
  libraryId: 'lib_1',
  isActive: true,
  notes: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('LibrariesService', () => {
  let service: LibrariesService;
  const prisma = {
    library: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    publisherLibrary: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    publisher: {
      findUnique: jest.fn(),
    },
    inventory: {
      groupBy: jest.fn(),
    },
    bookCopy: {
      groupBy: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.library.findFirst.mockResolvedValue(null);
    prisma.publisher.findUnique.mockResolvedValue({ id: 'pub_1' });
    prisma.inventory.groupBy.mockResolvedValue([]);
    prisma.bookCopy.groupBy.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: typeof prisma) => Promise<unknown>)(prisma);
      }
      return arg;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LibrariesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(LibrariesService);
  });

  it('creates a library, slugifies the name, and auto-links the publisher', async () => {
    prisma.library.create.mockResolvedValue(libraryRow);
    prisma.publisherLibrary.create.mockResolvedValue(linkRow);

    const result = await service.create(
      { name: 'Riverside Public' },
      publisherAdminUser('pub_1'),
    );

    expect(prisma.library.create).toHaveBeenCalledTimes(1);
    const calls = prisma.library.create.mock.calls as Array<
      [{ data: { name: string; slug: string; isActive: boolean } }]
    >;
    expect(calls[0]?.[0].data).toMatchObject({
      name: 'Riverside Public',
      slug: 'riverside-public',
      isActive: true,
    });
    expect(prisma.publisherLibrary.create).toHaveBeenCalledWith({
      data: {
        publisherId: 'pub_1',
        libraryId: 'lib_1',
        notes: undefined,
      },
    });
    expect(result.link?.publisherId).toBe('pub_1');
  });

  it('lets SUPER_ADMIN create a library without linking', async () => {
    prisma.library.create.mockResolvedValue(libraryRow);

    const result = await service.create(
      { name: 'Riverside Public' },
      superAdminUser,
    );

    expect(prisma.publisherLibrary.create).not.toHaveBeenCalled();
    expect(result.link).toBeNull();
  });

  it('throws NotFoundException when the library is missing', async () => {
    prisma.library.findUnique.mockResolvedValue(null);

    await expect(
      service.findOne('missing', superAdminUser),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('forbids a library admin from reading another library', async () => {
    prisma.library.findUnique.mockResolvedValue({
      ...libraryRow,
      id: 'lib_other',
    });

    await expect(
      service.findOne('lib_other', libraryAdminUser('lib_1')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('forbids a publisher from reading an unlinked library', async () => {
    prisma.library.findUnique.mockResolvedValue(libraryRow);
    prisma.publisherLibrary.findUnique.mockResolvedValue(null);

    await expect(
      service.findOne('lib_1', publisherAdminUser('pub_1')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns a linked library for the publisher', async () => {
    prisma.library.findUnique.mockResolvedValue(libraryRow);
    prisma.publisherLibrary.findUnique.mockResolvedValue(linkRow);

    const result = await service.findOne('lib_1', publisherAdminUser('pub_1'));
    expect(result.id).toBe('lib_1');
    expect(result.link?.id).toBe('link_1');
  });

  it('links an existing library by slug', async () => {
    prisma.library.findUnique.mockResolvedValue(libraryRow);
    prisma.publisherLibrary.findUnique.mockResolvedValue(null);
    prisma.publisherLibrary.create.mockResolvedValue(linkRow);

    const result = await service.link(
      { slug: 'riverside-public' },
      publisherAdminUser('pub_1'),
    );

    expect(result.link?.publisherId).toBe('pub_1');
    expect(prisma.publisherLibrary.create).toHaveBeenCalledTimes(1);
  });

  it('rejects a duplicate link', async () => {
    prisma.library.findUnique.mockResolvedValue(libraryRow);
    prisma.publisherLibrary.findUnique.mockResolvedValue(linkRow);

    await expect(
      service.link({ libraryId: 'lib_1' }, publisherAdminUser('pub_1')),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects linking an inactive library', async () => {
    prisma.library.findUnique.mockResolvedValue({
      ...libraryRow,
      isActive: false,
    });

    await expect(
      service.link({ slug: 'riverside-public' }, publisherAdminUser('pub_1')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('unlinks a partnership', async () => {
    prisma.library.findUnique.mockResolvedValue(libraryRow);
    prisma.publisherLibrary.findUnique.mockResolvedValue(linkRow);
    prisma.publisherLibrary.delete.mockResolvedValue(linkRow);

    await service.unlink('lib_1', publisherAdminUser('pub_1'));

    expect(prisma.publisherLibrary.delete).toHaveBeenCalledWith({
      where: { id: 'link_1' },
    });
  });

  it('forbids publisher staff from managing links', async () => {
    const staff = {
      ...publisherAdminUser('pub_1'),
      role: Role.PUBLISHER_STAFF,
    };

    await expect(
      service.create({ name: 'New Branch' }, staff),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
