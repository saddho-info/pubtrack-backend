import { Body, Controller, Get, Param, Patch, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { UpdateSystemSettingDto } from './dto/update-system-setting.dto';
import { UpsertSystemSettingDto } from './dto/upsert-system-setting.dto';
import { SystemSettingsService } from './system-settings.service';

@ApiTags('system-settings')
@ApiBearerAuth()
@Roles(Role.SUPER_ADMIN)
@Controller('system-settings')
export class SystemSettingsController {
  constructor(private readonly systemSettingsService: SystemSettingsService) {}

  @Get()
  @ApiOkResponse({ description: 'All system settings' })
  findAll() {
    return this.systemSettingsService.findAll();
  }

  @Get(':key')
  findOne(@Param('key') key: string) {
    return this.systemSettingsService.findOne(key);
  }

  @Put(':key')
  @ApiOkResponse({ description: 'System setting upserted' })
  upsert(@Param('key') key: string, @Body() dto: UpsertSystemSettingDto) {
    return this.systemSettingsService.upsert(key, dto);
  }

  @Patch(':key')
  update(@Param('key') key: string, @Body() dto: UpdateSystemSettingDto) {
    return this.systemSettingsService.update(key, dto);
  }
}
