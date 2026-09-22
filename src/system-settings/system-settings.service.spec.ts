import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { SystemSettingsService } from './system-settings.service';

describe('SystemSettingsService', () => {
  let service: SystemSettingsService;
  const prisma = {
    systemSetting: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        SystemSettingsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(SystemSettingsService);
  });

  it('upserts a JSON setting by validated key', async () => {
    prisma.systemSetting.upsert.mockResolvedValue({
      key: 'platform.maintenanceMode',
      value: false,
    });

    await service.upsert('platform.maintenanceMode', { value: false });

    expect(prisma.systemSetting.upsert).toHaveBeenCalledWith({
      where: { key: 'platform.maintenanceMode' },
      create: {
        key: 'platform.maintenanceMode',
        value: false,
        description: undefined,
      },
      update: { value: false, description: undefined },
    });
  });

  it('rejects invalid keys', () => {
    expect(() => service.upsert('Platform Setting', { value: true })).toThrow(
      BadRequestException,
    );
  });

  it('rejects non-JSON values', () => {
    expect(() =>
      service.upsert('platform.invalid', { value: Number.NaN }),
    ).toThrow(BadRequestException);
  });
});
