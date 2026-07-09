import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { ConditionalThrottleGuard } from './conditional-throttle.guard';

describe('ConditionalThrottleGuard', () => {
  let guard: ConditionalThrottleGuard;
  let mockThrottlerGuard: jest.Mocked<ThrottlerGuard>;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const mockThrottler = {
      canActivate: jest.fn().mockResolvedValue(true),
    };

    const mockConfig = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'RATE_LIMIT_ENABLED') {
          return true;
        }
        return defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConditionalThrottleGuard,
        { provide: ThrottlerGuard, useValue: mockThrottler },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    guard = module.get<ConditionalThrottleGuard>(ConditionalThrottleGuard);
    mockThrottlerGuard = module.get(ThrottlerGuard);
    mockConfigService = module.get(ConfigService);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    let mockContext: ExecutionContext;

    beforeEach(() => {
      mockContext = {
        switchToHttp: jest.fn().mockReturnThis(),
        getRequest: jest.fn().mockReturnValue({}),
      } as unknown as ExecutionContext;
      jest.clearAllMocks();
    });

    it('should bypass throttling (return true) when RATE_LIMIT_ENABLED is false', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'RATE_LIMIT_ENABLED') return false;
        return undefined;
      });

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(mockThrottlerGuard.canActivate).not.toHaveBeenCalled();
    });

    it('should delegate to ThrottlerGuard when RATE_LIMIT_ENABLED is true', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'RATE_LIMIT_ENABLED') return true;
        return undefined;
      });
      mockThrottlerGuard.canActivate.mockResolvedValue(true);

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(mockThrottlerGuard.canActivate).toHaveBeenCalledWith(mockContext);
    });

    it('should default to enabled and delegate to ThrottlerGuard if RATE_LIMIT_ENABLED is unset', async () => {
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'RATE_LIMIT_ENABLED') return defaultValue ?? true;
        return undefined;
      });
      mockThrottlerGuard.canActivate.mockResolvedValue(true);

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(mockThrottlerGuard.canActivate).toHaveBeenCalledWith(mockContext);
    });

    it('should bypass throttling when isE2E returns true (NODE_ENV is test)', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'RATE_LIMIT_ENABLED') return true;
        return undefined;
      });

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(mockThrottlerGuard.canActivate).not.toHaveBeenCalled();

      process.env.NODE_ENV = originalNodeEnv;
    });
  });
});
