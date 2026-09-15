import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateEditionDto } from './create-edition.dto';

export class UpdateEditionDto extends PartialType(
  OmitType(CreateEditionDto, ['bookId'] as const),
) {}
