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
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.PUBLISHER_ADMIN, Role.LIBRARY_ADMIN)
  @ApiCreatedResponse({ description: 'User created' })
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthUser) {
    return this.usersService.create(dto, actor);
  }

  @Get()
  @ApiOkResponse({ description: 'Paginated users in the caller scope' })
  findAll(@Query() query: PaginationQueryDto, @CurrentUser() actor: AuthUser) {
    return this.usersService.findAll(query, actor);
  }

  @Get(':id')
  @ApiOkResponse({ description: 'User by id' })
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.usersService.findOne(id, actor);
  }

  @Patch(':id')
  @ApiOkResponse({ description: 'User updated' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.usersService.update(id, dto, actor);
  }
}
