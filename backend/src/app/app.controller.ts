import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { AppService } from './app.service';
import { SuccessResponse } from './common/response.util';
import { DataSource } from 'typeorm';
import { RedisService } from './redis/redis.service';
import { ConfigService } from '@nestjs/config';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  getData() {
    const result = this.appService.getData();
    return new SuccessResponse('Welcome data retrieved successfully', result);
  }

  @Get('health')
  async healthCheck() {
    let dbStatus = 'up';
    let redisStatus = 'up';
    let isHealthy = true;

    try {
      await this.dataSource.query('SELECT 1');
    } catch (err: any) {
      dbStatus = 'down';
      isHealthy = false;
    }

    try {
      const isRedisOk = await this.redisService.ping();
      if (!isRedisOk) {
        redisStatus = 'down';
        isHealthy = false;
      }
    } catch (err: any) {
      redisStatus = 'down';
      isHealthy = false;
    }

    const healthData = {
      status: isHealthy ? 'ok' : 'error',
      database: dbStatus,
      redis: redisStatus,
      uptime: Math.floor(process.uptime()),
      version: process.env.npm_package_version || '1.0.0',
      environment: this.configService.get<string>('NODE_ENV') || 'development',
      timestamp: new Date().toISOString(),
      build: this.configService.get<string>('BUILD_SHA') || 'dev',
    };

    if (!isHealthy) {
      throw new ServiceUnavailableException({
        success: false,
        message: 'Service is temporarily unavailable',
        data: healthData,
      });
    }

    return new SuccessResponse(
      'Health status checked successfully',
      healthData,
    );
  }
}
