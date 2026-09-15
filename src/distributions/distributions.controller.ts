import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '../../generated/prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { CreateDistributionDto } from './dto/create-distribution.dto';
import { DistributionQueryDto } from './dto/distribution-query.dto';
import { UpdateDistributionDto } from './dto/update-distribution.dto';
import { DistributionsService } from './distributions.service';

const READ_ROLES = [
  Role.SUPER_ADMIN,
  Role.PUBLISHER_ADMIN,
  Role.PUBLISHER_STAFF,
  Role.LIBRARY_ADMIN,
  Role.LIBRARY_STAFF,
] as const;

const WRITE_ROLES = [
  Role.SUPER_ADMIN,
  Role.PUBLISHER_ADMIN,
  Role.PUBLISHER_STAFF,
] as const;

@ApiTags('distributions')
@ApiBearerAuth()
@Controller('distributions')
export class DistributionsController {
  constructor(private readonly distributionsService: DistributionsService) {}

  @Post()
  @Roles(...WRITE_ROLES)
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Replay-safe key for creating a shipment.',
  })
  @ApiCreatedResponse({
    description: 'Distribution draft created (and dispatched when requested)',
  })
  create(
    @Body() dto: CreateDistributionDto,
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.distributionsService.create(dto, user, idempotencyKey);
  }

  @Get()
  @Roles(...READ_ROLES)
  @ApiOkResponse({ description: 'Paginated distributions in the caller scope' })
  findAll(@Query() query: DistributionQueryDto, @CurrentUser() user: AuthUser) {
    return this.distributionsService.findAll(query, user);
  }

  @Get('summary')
  @Roles(...READ_ROLES)
  @ApiOkResponse({ description: 'Distribution counts by status' })
  summary(@Query() query: DistributionQueryDto, @CurrentUser() user: AuthUser) {
    return this.distributionsService.getSummary(query, user);
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  @ApiOkResponse({ description: 'Distribution by id' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.distributionsService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  @ApiOkResponse({ description: 'Draft distribution updated' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDistributionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.distributionsService.update(id, dto, user);
  }

  @Patch(':id/dispatch')
  @Roles(...WRITE_ROLES)
  @ApiOkResponse({
    description:
      'Copies marked DISTRIBUTED and warehouse stock moved in transit',
  })
  dispatch(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.distributionsService.dispatch(id, user);
  }

  @Patch(':id/cancel')
  @Roles(...WRITE_ROLES)
  @ApiOkResponse({ description: 'Draft distribution cancelled' })
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.distributionsService.cancel(id, user);
  }
}
