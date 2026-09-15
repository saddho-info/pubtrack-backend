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
import { CreateStockReceiptDto } from './dto/create-stock-receipt.dto';
import { StockReceiptQueryDto } from './dto/stock-receipt-query.dto';
import { UpdateStockReceiptDto } from './dto/update-stock-receipt.dto';
import { ReceivingService } from './receiving.service';

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

@ApiTags('stock-receipts')
@ApiBearerAuth()
@Controller('stock-receipts')
export class ReceivingController {
  constructor(private readonly receivingService: ReceivingService) {}

  @Post()
  @Roles(...WRITE_ROLES)
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description:
      'Required when confirm is true. Replay-safe key for a receipt.',
  })
  @ApiCreatedResponse({
    description: 'Stock receipt draft created (and confirmed when requested)',
  })
  create(
    @Body() dto: CreateStockReceiptDto,
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.receivingService.create(dto, user, idempotencyKey);
  }

  @Get()
  @Roles(...READ_ROLES)
  @ApiOkResponse({
    description: 'Paginated stock receipts in the caller scope',
  })
  findAll(@Query() query: StockReceiptQueryDto, @CurrentUser() user: AuthUser) {
    return this.receivingService.findAll(query, user);
  }

  @Get('summary')
  @Roles(...READ_ROLES)
  @ApiOkResponse({ description: 'Stock receipt counts by status' })
  summary(@Query() query: StockReceiptQueryDto, @CurrentUser() user: AuthUser) {
    return this.receivingService.getSummary(query, user);
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  @ApiOkResponse({ description: 'Stock receipt by id' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.receivingService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  @ApiOkResponse({ description: 'Draft stock receipt updated' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStockReceiptDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.receivingService.update(id, dto, user);
  }

  @Patch(':id/confirm')
  @Roles(...WRITE_ROLES)
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Replay-safe key for confirming a receipt.',
  })
  @ApiOkResponse({
    description:
      'Copies marked IN_STOCK_LIBRARY and in-transit stock moved on hand',
  })
  confirm(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.receivingService.confirm(id, user, idempotencyKey);
  }

  @Patch(':id/cancel')
  @Roles(...WRITE_ROLES)
  @ApiOkResponse({ description: 'Draft stock receipt cancelled' })
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.receivingService.cancel(id, user);
  }
}
