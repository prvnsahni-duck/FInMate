import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RedisService } from './redis/redis.service';
import { DataSource } from 'typeorm';
import { SuccessResponse } from './common/response.util';
import { ServiceUnavailableException } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

describe('AppController', () => {
  let app: TestingModule;
  let redisServiceMock: { ping: jest.Mock };
  let dataSourceMock: { query: jest.Mock };

  beforeAll(async () => {
    redisServiceMock = {
      ping: jest.fn(),
    };
    dataSourceMock = {
      query: jest.fn(),
    };

    app = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: RedisService,
          useValue: redisServiceMock,
        },
        {
          provide: DataSource,
          useValue: dataSourceMock,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('development'),
          },
        },
      ],
    }).compile();
  });

  describe('getData', () => {
    it('should return "Hello API"', () => {
      const appController = app.get<AppController>(AppController);
      expect(appController.getData()).toEqual(
        new SuccessResponse('Welcome data retrieved successfully', {
          message: 'Hello API',
        }),
      );
    });
  });

  describe('healthCheck', () => {
    it('should return 200 health check diagnostics when all systems are healthy', async () => {
      const appController = app.get<AppController>(AppController);
      redisServiceMock.ping.mockResolvedValue(true);
      dataSourceMock.query.mockResolvedValue([{ '?column?': 1 }]);

      const result = await appController.healthCheck();
      expect(result).toBeDefined();
      expect(result.data.status).toBe('ok');
      expect(result.data.database).toBe('up');
      expect(result.data.redis).toBe('up');
    });

    it('should throw ServiceUnavailableException if database ping fails', async () => {
      const appController = app.get<AppController>(AppController);
      redisServiceMock.ping.mockResolvedValue(true);
      dataSourceMock.query.mockRejectedValue(new Error('DB Down'));

      await expect(appController.healthCheck()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('should throw ServiceUnavailableException if redis ping fails', async () => {
      const appController = app.get<AppController>(AppController);
      redisServiceMock.ping.mockResolvedValue(false);
      dataSourceMock.query.mockResolvedValue([{ '?column?': 1 }]);

      await expect(appController.healthCheck()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});
