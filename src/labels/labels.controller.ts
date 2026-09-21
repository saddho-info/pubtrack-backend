import {
  Controller,
  Get,
  Param,
  Query,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '../../generated/prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { LabelQueryDto } from './dto/label-query.dto';
import { LabelsService } from './labels.service';

const PUBLISHER_ROLES = [
  Role.SUPER_ADMIN,
  Role.PUBLISHER_ADMIN,
  Role.PUBLISHER_STAFF,
] as const;

@ApiTags('labels')
@ApiBearerAuth()
@Controller('labels')
export class LabelsController {
  constructor(private readonly labels: LabelsService) {}

  @Get(':editionId.pdf')
  @Roles(...PUBLISHER_ROLES)
  @ApiProduces('application/pdf')
  @ApiOkResponse({ description: 'Printable QR labels as PDF' })
  async download(
    @Param('editionId') editionId: string,
    @Query() query: LabelQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const body = await this.labels.generate(editionId, query, user);
    const suffix = query.offset > 0 ? `-${query.offset + 1}` : '';
    return new StreamableFile(body, {
      type: 'application/pdf',
      disposition: `attachment; filename="labels-${editionId}-${query.format}${suffix}.pdf"`,
    });
  }
}
