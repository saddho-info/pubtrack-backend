import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return { status: 'ok' as const, service: 'pubtrack-backend' };
  }
}
