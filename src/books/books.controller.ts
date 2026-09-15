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
import { BooksService } from './books.service';
import { BookQueryDto } from './dto/book-query.dto';
import { CreateBookDto } from './dto/create-book.dto';
import { UpdateBookDto } from './dto/update-book.dto';

const PUBLISHER_ROLES = [
  Role.SUPER_ADMIN,
  Role.PUBLISHER_ADMIN,
  Role.PUBLISHER_STAFF,
] as const;

@ApiTags('books')
@ApiBearerAuth()
@Roles(...PUBLISHER_ROLES)
@Controller('books')
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  @Post()
  @ApiCreatedResponse({ description: 'Book created' })
  create(@Body() dto: CreateBookDto, @CurrentUser() user: AuthUser) {
    return this.booksService.create(dto, user);
  }

  @Get()
  @ApiOkResponse({ description: 'Paginated books for the caller publisher' })
  findAll(@Query() query: BookQueryDto, @CurrentUser() user: AuthUser) {
    return this.booksService.findAll(query, user);
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Book with editions' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.booksService.findOne(id, user);
  }

  @Patch(':id')
  @ApiOkResponse({ description: 'Book updated' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBookDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.booksService.update(id, dto, user);
  }
}
