import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FeatureFlagScope } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureFlagsService } from './feature-flags.service';

describe('FeatureFlagsService', () => {
  let service: FeatureFlagsService;
  const prisma = {
    featureFlag: { findUnique: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        FeatureFlagsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(FeatureFlagsService);
  });

  it('resolves library before publisher and default', async () => {
    prisma.featureFlag.findUnique.mockResolvedValue({
      id: 'flag_1',
      key: 'sales.bulkEntry',
      isActive: true,
      overrides: [
        {
          id: 'pub_override',
          scope: FeatureFlagScope.PUBLISHER,
          publisherId: 'pub_1',
          libraryId: null,
          enabled: false,
        },
        {
          id: 'lib_override',
          scope: FeatureFlagScope.LIBRARY,
          publisherId: null,
          libraryId: 'lib_1',
          enabled: true,
        },
      ],
    });

    await expect(
      service.check({
        key: 'sales.bulkEntry',
        publisherId: 'pub_1',
        libraryId: 'lib_1',
      }),
    ).resolves.toEqual({
      key: 'sales.bulkEntry',
      enabled: true,
      source: 'LIBRARY',
      overrideId: 'lib_override',
    });
  });

  it('always resolves an inactive flag to false', async () => {
    prisma.featureFlag.findUnique.mockResolvedValue({
      key: 'sales.bulkEntry',
      isActive: false,
      overrides: [],
    });

    await expect(service.check({ key: 'sales.bulkEntry' })).resolves.toEqual({
      key: 'sales.bulkEntry',
      enabled: false,
      source: 'INACTIVE',
    });
  });

  it('defaults an active flag without an override to true', async () => {
    prisma.featureFlag.findUnique.mockResolvedValue({
      key: 'sales.bulkEntry',
      isActive: true,
      overrides: [],
    });

    await expect(service.check({ key: 'sales.bulkEntry' })).resolves.toEqual({
      key: 'sales.bulkEntry',
      enabled: true,
      source: 'DEFAULT',
    });
  });

  it('rejects an override with an ambiguous target', async () => {
    prisma.featureFlag.findUnique.mockResolvedValue({ id: 'flag_1' });

    await expect(
      service.upsertOverride('flag_1', {
        scope: FeatureFlagScope.PUBLISHER,
        publisherId: 'pub_1',
        libraryId: 'lib_1',
        enabled: true,
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
