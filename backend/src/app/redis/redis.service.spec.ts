import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

const mockRedisClient = {
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  on: jest.fn(),
};

jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedisClient),
}));

describe('RedisService', () => {
  let service: RedisService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('redis://localhost:6379'),
          },
        },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
    await service.onModuleInit();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  describe('setNx', () => {
    it('returns true when Redis SET returns OK', async () => {
      mockRedisClient.set.mockResolvedValueOnce('OK');
      const result = await service.setNx('test-key', 'test-val', 10);
      expect(result).toBe(true);
      expect(mockRedisClient.set).toHaveBeenCalledWith('test-key', 'test-val', {
        NX: true,
        EX: 10,
      });
    });

    it('returns false when Redis SET returns null or fails to acquire lock', async () => {
      mockRedisClient.set.mockResolvedValueOnce(null);
      const result = await service.setNx('test-key', 'test-val', 10);
      expect(result).toBe(false);
    });

    it('returns false and logs error on redis client error', async () => {
      mockRedisClient.set.mockRejectedValueOnce(
        new Error('Redis command timeout'),
      );
      const result = await service.setNx('test-key', 'test-val', 10);
      expect(result).toBe(false);
    });
  });
});
