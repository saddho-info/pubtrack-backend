import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '../../generated/prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CheckFeatureFlagDto } from './dto/check-feature-flag.dto';
import { CreateFeatureFlagDto } from './dto/create-feature-flag.dto';
import { UpdateFeatureFlagDto } from './dto/update-feature-flag.dto';
import { UpsertFeatureFlagOverrideDto } from './dto/upsert-feature-flag-override.dto';
import { FeatureFlagsService } from './feature-flags.service';

@ApiTags('feature-flags')
@ApiBearerAuth()
@Roles(Role.SUPER_ADMIN)
@Controller('feature-flags')
export class FeatureFlagsController {
  constructor(private readonly featureFlagsService: FeatureFlagsService) {}

  @Post()
  @ApiCreatedResponse({ description: 'Feature flag created' })
  create(@Body() dto: CreateFeatureFlagDto) {
    return this.featureFlagsService.create(dto);
  }

  @Get()
  @ApiOkResponse({ description: 'All feature flags and overrides' })
  findAll() {
    return this.featureFlagsService.findAll();
  }

  @Get('check')
  @ApiOkResponse({ description: 'Resolved feature flag value' })
  check(@Query() query: CheckFeatureFlagDto) {
    return this.featureFlagsService.check(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.featureFlagsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateFeatureFlagDto) {
    return this.featureFlagsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Feature flag deleted' })
  remove(@Param('id') id: string) {
    return this.featureFlagsService.remove(id);
  }

  @Put(':id/overrides')
  @ApiOkResponse({ description: 'Feature flag override upserted' })
  upsertOverride(
    @Param('id') id: string,
    @Body() dto: UpsertFeatureFlagOverrideDto,
  ) {
    return this.featureFlagsService.upsertOverride(id, dto);
  }

  @Delete(':id/overrides/:overrideId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Feature flag override deleted' })
  deleteOverride(
    @Param('id') id: string,
    @Param('overrideId') overrideId: string,
  ) {
    return this.featureFlagsService.deleteOverride(id, overrideId);
  }
}
