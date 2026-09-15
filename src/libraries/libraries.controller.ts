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
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '../../generated/prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { LibraryScopeGuard } from '../common/guards/library-scope.guard';
import type { AuthUser } from '../common/types/auth-user';
import { CreateLibraryDto } from './dto/create-library.dto';
import { LibraryQueryDto } from './dto/library-query.dto';
import { LinkLibraryDto } from './dto/link-library.dto';
import { UnlinkLibraryQueryDto } from './dto/unlink-library-query.dto';
import { UpdateLibraryDto } from './dto/update-library.dto';
import { UpdateLibraryLinkDto } from './dto/update-library-link.dto';
import { LibrariesService } from './libraries.service';

const READ_ROLES = [
  Role.SUPER_ADMIN,
  Role.PUBLISHER_ADMIN,
  Role.PUBLISHER_STAFF,
  Role.LIBRARY_ADMIN,
  Role.LIBRARY_STAFF,
] as const;

const MANAGE_ROLES = [Role.SUPER_ADMIN, Role.PUBLISHER_ADMIN] as const;

@ApiTags('libraries')
@ApiBearerAuth()
@Controller('libraries')
export class LibrariesController {
  constructor(private readonly librariesService: LibrariesService) {}

  @Post()
  @Roles(...MANAGE_ROLES)
  @ApiCreatedResponse({
    description: 'Library created (and linked when publisher-scoped)',
  })
  create(@Body() dto: CreateLibraryDto, @CurrentUser() user: AuthUser) {
    return this.librariesService.create(dto, user);
  }

  @Get()
  @Roles(...READ_ROLES)
  @ApiOkResponse({ description: 'Paginated libraries in the caller scope' })
  findAll(@Query() query: LibraryQueryDto, @CurrentUser() user: AuthUser) {
    return this.librariesService.findAll(query, user);
  }

  @Post('links')
  @Roles(...MANAGE_ROLES)
  @ApiCreatedResponse({
    description: 'Existing library linked to the publisher',
  })
  link(@Body() dto: LinkLibraryDto, @CurrentUser() user: AuthUser) {
    return this.librariesService.link(dto, user);
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  @UseGuards(LibraryScopeGuard)
  @ApiOkResponse({ description: 'Library by id' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.librariesService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.PUBLISHER_ADMIN, Role.LIBRARY_ADMIN)
  @UseGuards(LibraryScopeGuard)
  @ApiOkResponse({ description: 'Library updated' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLibraryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.librariesService.update(id, dto, user);
  }

  @Patch(':id/link')
  @Roles(...MANAGE_ROLES)
  @ApiOkResponse({ description: 'Partnership notes or active flag updated' })
  updateLink(
    @Param('id') id: string,
    @Body() dto: UpdateLibraryLinkDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.librariesService.updateLink(id, dto, user);
  }

  @Delete(':id/link')
  @Roles(...MANAGE_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Partnership removed' })
  unlink(
    @Param('id') id: string,
    @Query() query: UnlinkLibraryQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.librariesService.unlink(id, user, query.publisherId);
  }
}
