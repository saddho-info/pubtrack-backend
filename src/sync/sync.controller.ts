import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '../../generated/prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { SyncBatchDto } from './dto/sync-batch.dto';
import { SyncService } from './sync.service';

@ApiTags('sync')
@ApiBearerAuth()
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post('batch')
  @Roles(Role.SUPER_ADMIN, Role.LIBRARY_ADMIN, Role.LIBRARY_STAFF)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOkResponse({
    description: 'Per-item accept/reject results for offline transactions',
  })
  batch(@Body() dto: SyncBatchDto, @CurrentUser() user: AuthUser) {
    return this.sync.processBatch(dto, user);
  }
}
