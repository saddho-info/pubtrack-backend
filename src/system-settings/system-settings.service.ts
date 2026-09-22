import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSystemSettingDto } from './dto/update-system-setting.dto';
import { UpsertSystemSettingDto } from './dto/upsert-system-setting.dto';

const SETTING_KEY_PATTERN = /^[a-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/;

@Injectable()
export class SystemSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.systemSetting.findMany({ orderBy: { key: 'asc' } });
  }

  async findOne(key: string) {
    this.validateKey(key);
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key },
    });
    if (!setting) {
      throw new NotFoundException(`System setting ${key} not found`);
    }
    return setting;
  }

  upsert(key: string, dto: UpsertSystemSettingDto) {
    this.validateKey(key);
    const value = this.toJsonValue(dto.value);
    return this.prisma.systemSetting.upsert({
      where: { key },
      create: { key, value, description: dto.description },
      update: { value, description: dto.description },
    });
  }

  async update(key: string, dto: UpdateSystemSettingDto) {
    this.validateKey(key);
    await this.findOne(key);
    if (dto.value === undefined && dto.description === undefined) {
      throw new BadRequestException('At least one setting field is required');
    }
    return this.prisma.systemSetting.update({
      where: { key },
      data: {
        value:
          dto.value === undefined ? undefined : this.toJsonValue(dto.value),
        description: dto.description,
      },
    });
  }

  private validateKey(key: string): void {
    if (key.length > 120 || !SETTING_KEY_PATTERN.test(key)) {
      throw new BadRequestException(
        'Setting key must start with a lowercase letter and contain only letters, numbers, dots, underscores, or hyphens',
      );
    }
  }

  private toJsonValue(
    value: unknown,
  ): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (!this.isJsonValue(value, new Set())) {
      throw new BadRequestException('value must be valid JSON');
    }
    return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
  }

  private isJsonValue(value: unknown, seen: Set<object>): boolean {
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean'
    ) {
      return true;
    }
    if (typeof value === 'number') {
      return Number.isFinite(value);
    }
    if (typeof value !== 'object') {
      return false;
    }
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    const valid = Array.isArray(value)
      ? value.every((item) => this.isJsonValue(item, seen))
      : Object.getPrototypeOf(value) === Object.prototype &&
        Object.values(value).every((item) => this.isJsonValue(item, seen));
    seen.delete(value);
    return valid;
  }
}
