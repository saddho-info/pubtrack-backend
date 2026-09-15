import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { AnalyticsService } from './analytics.service';
import { OverviewQueryDto } from './dto/overview-query.dto';

@ApiTags('analytics')
@ApiBearerAuth()
@Roles(Role.SUPER_ADMIN, Role.PUBLISHER_ADMIN, Role.PUBLISHER_STAFF)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  @ApiOkResponse({
    description:
      'Publisher dashboard snapshot: KPIs, library rankings, low stock, top books, recent activity.',
  })
  overview(@Query() query: OverviewQueryDto, @CurrentUser() user: AuthUser) {
    return this.analyticsService.getOverview(user, query);
  }

  @Get('top-books')
  @ApiOkResponse({
    description: 'Best-selling editions in the selected period.',
  })
  topBooks(@Query() query: OverviewQueryDto, @CurrentUser() user: AuthUser) {
    return this.analyticsService.getTopBooks(user, query);
  }

  @Get('library-performance')
  @ApiOkResponse({
    description: 'Libraries ranked by confirmed sales in the selected period.',
  })
  libraryPerformance(
    @Query() query: OverviewQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.analyticsService.getLibraryPerformance(user, query);
  }
}
