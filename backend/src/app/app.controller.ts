import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { SuccessResponse } from './common/response.util';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getData() {
    const result = this.appService.getData();
    return new SuccessResponse('Welcome data retrieved successfully', result);
  }

  @Get('health')
  healthCheck() {
    const result = { status: 'ok', timestamp: new Date().toISOString() };
    return new SuccessResponse('Health status checked successfully', result);
  }
}
