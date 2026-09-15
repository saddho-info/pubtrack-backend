import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { InventoryQueryDto } from './dto/inventory-query.dto';
import { MovementQueryDto } from './dto/movement-query.dto';
import { UpdateThresholdDto } from './dto/update-threshold.dto';
import { InventoryService } from './inventory.service';

const READ_ROLES = [
  Role.SUPER_ADMIN,
  Role.PUBLISHER_ADMIN,
  Role.PUBLISHER_STAFF,
  Role.LIBRARY_ADMIN,
  Role.LIBRARY_STAFF,
] as const;

@ApiTags('inventory')
@ApiBearerAuth()
@Roles(...READ_ROLES)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @ApiOkResponse({
    description: 'Edition-level inventory rollups in the caller scope',
  })
  findAll(@Query() query: InventoryQueryDto, @CurrentUser() user: AuthUser) {
    return this.inventoryService.findAll(query, user);
  }

  @Get('low-stock')
  @ApiOkResponse({
    description: 'Editions at or below their reorder threshold',
  })
  lowStock(@Query() query: InventoryQueryDto, @CurrentUser() user: AuthUser) {
    return this.inventoryService.findLowStock(query, user);
  }

  @Get('summary')
  @ApiOkResponse({ description: 'Point-in-time inventory KPIs' })
  summary(@Query() query: InventoryQueryDto, @CurrentUser() user: AuthUser) {
    return this.inventoryService.getSummary(user, query);
  }

  @Get('movements')
  @ApiOkResponse({ description: 'Append-only inventory movement ledger' })
  movements(@Query() query: MovementQueryDto, @CurrentUser() user: AuthUser) {
    return this.inventoryService.findMovements(query, user);
  }

  @Patch('threshold')
  @ApiOkResponse({
    description: 'Update low-stock threshold for the caller holder',
  })
  updateThreshold(
    @Body() dto: UpdateThresholdDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.inventoryService.updateThreshold(dto, user);
  }
}
