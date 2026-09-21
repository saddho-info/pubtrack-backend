import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '../../generated/prisma/client';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PublisherScopeGuard } from '../common/guards/publisher-scope.guard';
import type { AuthUser } from '../common/types/auth-user';
import { CreatePublisherDto } from './dto/create-publisher.dto';
import { UpdatePublisherDto } from './dto/update-publisher.dto';
import { PublishersService } from './publishers.service';

const READ_ROLES = [
  Role.SUPER_ADMIN,
  Role.PUBLISHER_ADMIN,
  Role.PUBLISHER_STAFF,
  Role.LIBRARY_ADMIN,
  Role.LIBRARY_STAFF,
] as const;

@ApiTags('publishers')
@ApiBearerAuth()
@Controller('publishers')
export class PublishersController {
  constructor(private readonly publishersService: PublishersService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN)
  @ApiCreatedResponse({ description: 'Publisher created' })
  create(@Body() dto: CreatePublisherDto) {
    return this.publishersService.create(dto);
  }

  @Get()
  @Roles(...READ_ROLES)
  @ApiOkResponse({ description: 'Paginated publishers' })
  findAll(@Query() query: PaginationQueryDto, @CurrentUser() user: AuthUser) {
    return this.publishersService.findAll(query, user);
  }

  // Scoping happens in the service: library callers are allowed through by role
  // but must hold a PublisherLibrary link, which PublisherScopeGuard cannot see.
  @Get(':id')
  @Roles(...READ_ROLES)
  @ApiOkResponse({ description: 'Publisher by id' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.publishersService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.PUBLISHER_ADMIN)
  @UseGuards(PublisherScopeGuard)
  @ApiOkResponse({ description: 'Publisher updated' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePublisherDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.publishersService.update(id, dto, user);
  }
}
