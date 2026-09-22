import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FeatureFlagScope } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CheckFeatureFlagDto } from './dto/check-feature-flag.dto';
import { CreateFeatureFlagDto } from './dto/create-feature-flag.dto';
import { UpdateFeatureFlagDto } from './dto/update-feature-flag.dto';
import { UpsertFeatureFlagOverrideDto } from './dto/upsert-feature-flag-override.dto';

@Injectable()
export class FeatureFlagsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateFeatureFlagDto) {
    return this.prisma.featureFlag.create({
      data: dto,
      include: { overrides: true },
    });
  }

  findAll() {
    return this.prisma.featureFlag.findMany({
      orderBy: { key: 'asc' },
      include: { overrides: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async findOne(id: string) {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { id },
      include: { overrides: { orderBy: { createdAt: 'asc' } } },
    });
    if (!flag) {
      throw new NotFoundException(`Feature flag ${id} not found`);
    }
    return flag;
  }

  async update(id: string, dto: UpdateFeatureFlagDto) {
    await this.requireFlag(id);
    return this.prisma.featureFlag.update({
      where: { id },
      data: dto,
      include: { overrides: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async remove(id: string): Promise<void> {
    await this.requireFlag(id);
    await this.prisma.featureFlag.delete({ where: { id } });
  }

  async upsertOverride(id: string, dto: UpsertFeatureFlagOverrideDto) {
    await this.requireFlag(id);
    this.validateOverrideTarget(dto);
    await this.requireTarget(dto);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.featureFlagOverride.findFirst({
        where: {
          featureFlagId: id,
          scope: dto.scope,
          ...(dto.scope === FeatureFlagScope.PUBLISHER
            ? { publisherId: dto.publisherId }
            : { libraryId: dto.libraryId }),
        },
      });

      if (existing) {
        return tx.featureFlagOverride.update({
          where: { id: existing.id },
          data: { enabled: dto.enabled },
        });
      }

      return tx.featureFlagOverride.create({
        data: {
          featureFlagId: id,
          scope: dto.scope,
          publisherId: dto.publisherId,
          libraryId: dto.libraryId,
          enabled: dto.enabled,
        },
      });
    });
  }

  async deleteOverride(flagId: string, overrideId: string): Promise<void> {
    await this.requireFlag(flagId);
    const result = await this.prisma.featureFlagOverride.deleteMany({
      where: { id: overrideId, featureFlagId: flagId },
    });
    if (result.count === 0) {
      throw new NotFoundException(
        `Feature flag override ${overrideId} not found`,
      );
    }
  }

  async check(dto: CheckFeatureFlagDto) {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { key: dto.key },
      include: {
        overrides: {
          where: {
            OR: [
              ...(dto.libraryId ? [{ libraryId: dto.libraryId }] : []),
              ...(dto.publisherId ? [{ publisherId: dto.publisherId }] : []),
            ],
          },
        },
      },
    });
    if (!flag) {
      throw new NotFoundException(`Feature flag ${dto.key} not found`);
    }

    if (!flag.isActive) {
      return { key: flag.key, enabled: false, source: 'INACTIVE' as const };
    }

    const libraryOverride = dto.libraryId
      ? flag.overrides.find(
          (override) =>
            override.scope === FeatureFlagScope.LIBRARY &&
            override.libraryId === dto.libraryId,
        )
      : undefined;
    if (libraryOverride) {
      return {
        key: flag.key,
        enabled: libraryOverride.enabled,
        source: 'LIBRARY' as const,
        overrideId: libraryOverride.id,
      };
    }

    const publisherOverride = dto.publisherId
      ? flag.overrides.find(
          (override) =>
            override.scope === FeatureFlagScope.PUBLISHER &&
            override.publisherId === dto.publisherId,
        )
      : undefined;
    if (publisherOverride) {
      return {
        key: flag.key,
        enabled: publisherOverride.enabled,
        source: 'PUBLISHER' as const,
        overrideId: publisherOverride.id,
      };
    }

    return {
      key: flag.key,
      enabled: true,
      source: 'DEFAULT' as const,
    };
  }

  private async requireFlag(id: string) {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!flag) {
      throw new NotFoundException(`Feature flag ${id} not found`);
    }
  }

  private validateOverrideTarget(dto: UpsertFeatureFlagOverrideDto): void {
    const validPublisher =
      dto.scope === FeatureFlagScope.PUBLISHER &&
      Boolean(dto.publisherId) &&
      !dto.libraryId;
    const validLibrary =
      dto.scope === FeatureFlagScope.LIBRARY &&
      Boolean(dto.libraryId) &&
      !dto.publisherId;
    if (!validPublisher && !validLibrary) {
      throw new BadRequestException(
        'Override scope must identify exactly one matching publisher or library',
      );
    }
  }

  private async requireTarget(dto: UpsertFeatureFlagOverrideDto) {
    const target =
      dto.scope === FeatureFlagScope.PUBLISHER
        ? await this.prisma.publisher.findUnique({
            where: { id: dto.publisherId },
            select: { id: true },
          })
        : await this.prisma.library.findUnique({
            where: { id: dto.libraryId },
            select: { id: true },
          });
    if (!target) {
      throw new NotFoundException(
        `${dto.scope === FeatureFlagScope.PUBLISHER ? 'Publisher' : 'Library'} target not found`,
      );
    }
  }
}
