import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateLibraryDto } from './create-library.dto';

export class UpdateLibraryDto extends PartialType(
  OmitType(CreateLibraryDto, ['publisherId', 'notes'] as const),
) {}
