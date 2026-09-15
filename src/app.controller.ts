import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';

@ApiTags('health')
@Public()
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOkResponse({ description: 'API service metadata' })
  getHealth() {
    return this.appService.getHealth();
  }

  @Get('health')
  @ApiOkResponse({ description: 'Liveness probe' })
  getLiveness() {
    return this.appService.getHealth();
  }
}
