import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
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
import { CreateSaleDto } from './dto/create-sale.dto';
import { SaleQueryDto } from './dto/sale-query.dto';
import { SalesService } from './sales.service';

const READ_ROLES = [
  Role.SUPER_ADMIN,
  Role.PUBLISHER_ADMIN,
  Role.PUBLISHER_STAFF,
  Role.LIBRARY_ADMIN,
  Role.LIBRARY_STAFF,
] as const;

const WRITE_ROLES = [
  Role.SUPER_ADMIN,
  Role.LIBRARY_ADMIN,
  Role.LIBRARY_STAFF,
] as const;

@ApiTags('sales')
@ApiBearerAuth()
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  @Roles(...WRITE_ROLES)
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Replay-safe key for recording a sale.',
  })
  @ApiCreatedResponse({ description: 'Sale recorded and inventory updated' })
  create(
    @Body() dto: CreateSaleDto,
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.salesService.create(dto, user, idempotencyKey);
  }

  @Get()
  @Roles(...READ_ROLES)
  @ApiOkResponse({ description: 'Paginated sales in the caller scope' })
  findAll(@Query() query: SaleQueryDto, @CurrentUser() user: AuthUser) {
    return this.salesService.findAll(query, user);
  }

  @Get('summary')
  @Roles(...READ_ROLES)
  @ApiOkResponse({ description: 'Sale counts and revenue totals' })
  summary(@Query() query: SaleQueryDto, @CurrentUser() user: AuthUser) {
    return this.salesService.getSummary(query, user);
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  @ApiOkResponse({ description: 'Sale by id' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.salesService.findOne(id, user);
  }
}
