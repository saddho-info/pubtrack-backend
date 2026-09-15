import { Module } from '@nestjs/common';
import { BooksController } from './books.controller';
import { BooksService } from './books.service';
import { EditionsController } from './editions.controller';
import { EditionsService } from './editions.service';

@Module({
  controllers: [BooksController, EditionsController],
  providers: [BooksService, EditionsService],
  exports: [BooksService, EditionsService],
})
export class BooksModule {}
