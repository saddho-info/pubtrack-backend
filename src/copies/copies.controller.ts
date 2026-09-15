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
import { CopiesService } from './copies.service';
import { BulkCreateCopiesDto } from './dto/bulk-create-copies.dto';
import { CopyQueryDto } from './dto/copy-query.dto';

const PUBLISHER_ROLES = [
  Role.SUPER_ADMIN,
  Role.PUBLISHER_ADMIN,
  Role.PUBLISHER_STAFF,
] as const;

const READ_ROLES = [
  Role.SUPER_ADMIN,
  Role.PUBLISHER_ADMIN,
  Role.PUBLISHER_STAFF,
  Role.LIBRARY_ADMIN,
  Role.LIBRARY_STAFF,
] as const;

@ApiTags('copies')
@ApiBearerAuth()
@Controller('copies')
export class CopiesController {
  constructor(private readonly copiesService: CopiesService) {}

  @Post('bulk')
  @Roles(...PUBLISHER_ROLES)
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Replay-safe key for bulk print runs.',
  })
  @ApiCreatedResponse({
    description: 'Copies printed into publisher warehouse',
  })
  bulkCreate(
    @Body() dto: BulkCreateCopiesDto,
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.copiesService.bulkCreate(dto, user, idempotencyKey);
  }

  @Get()
  @Roles(...READ_ROLES)
  @ApiOkResponse({ description: 'Paginated copies in the caller scope' })
  findAll(@Query() query: CopyQueryDto, @CurrentUser() user: AuthUser) {
    return this.copiesService.findAll(query, user);
  }

  @Get('by-qr/:token')
  @Roles(...READ_ROLES)
  @ApiOkResponse({ description: 'Copy identified by opaque QR token' })
  findByQr(
    @Param('token') token: string,
    @Query('includeQr') includeQr: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.copiesService.findByQrToken(token, user, includeQr === 'true');
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  @ApiOkResponse({ description: 'Copy by id' })
  findOne(
    @Param('id') id: string,
    @Query('includeQr') includeQr: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.copiesService.findOne(id, user, includeQr === 'true');
  }
}
