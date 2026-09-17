import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UnregisterDeviceDto } from './dto/unregister-device.dto';
import { NotificationsService } from './notifications.service';

const READ_ROLES = [
  Role.SUPER_ADMIN,
  Role.PUBLISHER_ADMIN,
  Role.PUBLISHER_STAFF,
  Role.LIBRARY_ADMIN,
  Role.LIBRARY_STAFF,
] as const;

@ApiTags('notifications')
@ApiBearerAuth()
@Roles(...READ_ROLES)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOkResponse({ description: 'In-app notifications for the caller scope' })
  findAll(@Query() query: NotificationQueryDto, @CurrentUser() user: AuthUser) {
    return this.notifications.findAll(query, user);
  }

  @Patch(':id/read')
  @ApiOkResponse({ description: 'Notification marked read' })
  async markRead(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const row = await this.notifications.markRead(id, user);
    if (!row) {
      throw new NotFoundException(`Notification ${id} not found`);
    }
    return row;
  }

  @Post('devices')
  @ApiOkResponse({ description: 'FCM device token registered' })
  registerDevice(
    @Body() dto: RegisterDeviceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.notifications.registerDevice(dto, user);
  }

  @Delete('devices')
  @ApiOkResponse({ description: 'FCM device token unregistered' })
  unregisterDevice(
    @Body() dto: UnregisterDeviceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.notifications.unregisterDevice(dto.token, user);
  }
}
