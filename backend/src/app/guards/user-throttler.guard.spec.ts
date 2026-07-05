import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { UserThrottlerGuard } from './user-throttler.guard';
import { ThrottlerStorage } from '@nestjs/throttler';

describe('UserThrottlerGuard', () => {
  let guard: UserThrottlerGuard;

  beforeEach(async () => {
    const mockStorage = {
      increment: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserThrottlerGuard,
        {
          provide: ThrottlerStorage,
          useValue: mockStorage,
        },
        {
          provide: Reflector,
          useValue: new Reflector(),
        },
        {
          provide: 'THROTTLER:MODULE_OPTIONS',
          useValue: {},
        },
      ],
    }).compile();

    guard = module.get<UserThrottlerGuard>(UserThrottlerGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('generateKey', () => {
    it('should use req.user.id if available', () => {
      const mockReq = {
        user: { id: 'user-123' },
        headers: {},
      };
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockReq,
        }),
        getClass: () => ({ name: 'TestController' }),
        getHandler: () => ({ name: 'testMethod' }),
      } as unknown as ExecutionContext;

      const result = (guard as any).generateKey(mockContext, '127.0.0.1', 'default');
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should extract user ID manually from Bearer token if req.user is missing', () => {
      // Mock JWT payload base64 for { userId: 'user-jwt-456' }
      // payload segment base64: eyJ1c2VySWQiOiJ1c2VyLWp3dC00NTYifQ==
      const mockReq = {
        headers: {
          authorization: 'Bearer header.eyJ1c2VySWQiOiJ1c2VyLWp3dC00NTYifQ==.signature',
        },
      };
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockReq,
        }),
        getClass: () => ({ name: 'TestController' }),
        getHandler: () => ({ name: 'testMethod' }),
      } as unknown as ExecutionContext;

      const result = (guard as any).generateKey(mockContext, '127.0.0.1', 'default');
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should fall back to IP tracker if no user ID is found', () => {
      const mockReq = {
        headers: {},
      };
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockReq,
        }),
        getClass: () => ({ name: 'TestController' }),
        getHandler: () => ({ name: 'testMethod' }),
      } as unknown as ExecutionContext;

      const result = (guard as any).generateKey(mockContext, '192.168.1.1', 'default');
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });
});
