import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '../../generated/prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { CreateEditionDto } from './dto/create-edition.dto';
import { EditionQueryDto } from './dto/edition-query.dto';
import { LibraryPerformanceResponseDto } from './dto/library-performance-response.dto';
import { UpdateEditionDto } from './dto/update-edition.dto';
import { EditionsService } from './editions.service';

const PUBLISHER_ROLES = [
  Role.SUPER_ADMIN,
  Role.PUBLISHER_ADMIN,
  Role.PUBLISHER_STAFF,
] as const;

@ApiTags('editions')
@ApiBearerAuth()
@Roles(...PUBLISHER_ROLES)
@Controller('editions')
export class EditionsController {
  constructor(private readonly editionsService: EditionsService) {}

  @Post()
  @ApiCreatedResponse({ description: 'Edition created' })
  create(@Body() dto: CreateEditionDto, @CurrentUser() user: AuthUser) {
    return this.editionsService.create(dto, user);
  }

  @Get()
  @ApiOkResponse({ description: 'Paginated editions' })
  findAll(@Query() query: EditionQueryDto, @CurrentUser() user: AuthUser) {
    return this.editionsService.findAll(query, user);
  }

  @Get(':editionId/library-performance')
  @ApiOkResponse({
    description: 'Library performance for one edition',
    type: LibraryPerformanceResponseDto,
  })
  libraryPerformance(
    @Param('editionId') editionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.editionsService.getLibraryPerformance(editionId, user);
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Edition by id' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.editionsService.findOne(id, user);
  }

  @Patch(':id')
  @ApiOkResponse({ description: 'Edition updated' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEditionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.editionsService.update(id, dto, user);
  }
}
