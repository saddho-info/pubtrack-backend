import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { AuditService } from './audit.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

@ApiTags('audit-logs')
@ApiBearerAuth()
@Roles(
  Role.SUPER_ADMIN,
  Role.PUBLISHER_ADMIN,
  Role.PUBLISHER_STAFF,
  Role.LIBRARY_ADMIN,
)
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOkResponse({ description: 'Paginated inventory-mutating audit log' })
  findAll(@Query() query: AuditLogQueryDto, @CurrentUser() user: AuthUser) {
    return this.audit.findAll(query, user);
  }
}
