import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { UserThrottlerGuard } from './user-throttler.guard';
import { ThrottlerStorage } from '@nestjs/throttler';

describe('UserThrottlerGuard', () => {
  let guard: UserThrottlerGuard;
  let mockStorage: any;

  beforeEach(async () => {
    mockStorage = {
      increment: jest.fn().mockResolvedValue({
        totalHits: 1,
        timeToExpire: 60,
        isBlocked: false,
        timeToBlockExpire: 0,
      }),
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

  describe('handleRequest — throttleContext', () => {
    function createHandleRequestProps(overrides: any = {}) {
      const req: any = {
        headers: {},
        ...overrides.req,
      };
      const res: any = {
        header: jest.fn(),
        ...overrides.res,
      };

      // Mock getRequestResponse to return our mock req/res
      (guard as any).getRequestResponse = jest.fn().mockReturnValue({ req, res });
      (guard as any).headerPrefix = 'X-RateLimit';
      // Initialize commonOptions so handleRequest can access ignoreUserAgents etc.
      (guard as any).commonOptions = (guard as any).commonOptions || {};
      // Wire up storageService to our mock
      (guard as any).storageService = mockStorage;

      return {
        props: {
          context: {} as ExecutionContext,
          limit: overrides.limit ?? 100,
          ttl: 60000,
          throttler: {
            name: overrides.profileName ?? 'default',
            ignoreUserAgents: undefined,
            setHeaders: true,
          },
          blockDuration: 60000,
          getTracker: jest.fn().mockResolvedValue('127.0.0.1'),
          generateKey: jest.fn().mockReturnValue('test-key'),
        },
        req,
        res,
      };
    }

    it('should populate req.throttleContext with userId from req.user', async () => {
      const { props, req } = createHandleRequestProps({
        req: { user: { id: 'user-abc' }, headers: {} },
      });

      await (guard as any).handleRequest(props);

      expect(req.throttleContext).toBeDefined();
      expect(req.throttleContext.userId).toBe('user-abc');
      expect(req.throttleContext.profile).toBe('default');
      expect(req.throttleContext.limit).toBe(100);
      expect(req.throttleContext.remaining).toBe(99); // 100 - 1
      expect(req.throttleContext.retryAfter).toBe(0);
      expect(req.throttleContext.blockedUntil).toBe(0);
      expect(req.throttleContext.throttleKey).toBe('user:user-abc');
    });

    it('should populate req.throttleContext with userId from JWT fallback', async () => {
      const { props, req } = createHandleRequestProps({
        req: {
          headers: {
            authorization: 'Bearer header.eyJ1c2VySWQiOiJ1c2VyLWp3dC03ODkifQ==.signature',
          },
        },
      });

      await (guard as any).handleRequest(props);

      expect(req.throttleContext).toBeDefined();
      expect(req.throttleContext.userId).toBe('user-jwt-789');
      expect(req.throttleContext.throttleKey).toBe('user:user-jwt-789');
    });

    it('should set userId to "anonymous" when no user info is available', async () => {
      const { props, req } = createHandleRequestProps({
        req: { headers: {} },
      });

      await (guard as any).handleRequest(props);

      expect(req.throttleContext.userId).toBe('anonymous');
      expect(req.throttleContext.throttleKey).toBe('127.0.0.1');
    });

    it('should set the correct profile name from the throttler', async () => {
      const { props, req } = createHandleRequestProps({
        profileName: 'login',
        req: { headers: {} },
      });

      await (guard as any).handleRequest(props);

      expect(req.throttleContext.profile).toBe('login');
    });

    it('should calculate remaining correctly', async () => {
      mockStorage.increment.mockResolvedValueOnce({
        totalHits: 7,
        timeToExpire: 55,
        isBlocked: false,
        timeToBlockExpire: 0,
      });

      const { props, req } = createHandleRequestProps({
        limit: 10,
        req: { headers: {} },
      });

      await (guard as any).handleRequest(props);

      expect(req.throttleContext.limit).toBe(10);
      expect(req.throttleContext.remaining).toBe(3); // 10 - 7
    });

    it('should set blockedUntil when blocked', async () => {
      mockStorage.increment.mockResolvedValueOnce({
        totalHits: 6,
        timeToExpire: 55,
        isBlocked: true,
        timeToBlockExpire: 30,
      });

      // throwThrottlingException will throw, so we mock it
      (guard as any).throwThrottlingException = jest.fn();

      const beforeTime = Date.now();
      const { props, req } = createHandleRequestProps({
        limit: 5,
        req: { headers: {} },
      });

      await (guard as any).handleRequest(props);

      expect(req.throttleContext.retryAfter).toBe(30);
      expect(req.throttleContext.blockedUntil).toBeGreaterThanOrEqual(beforeTime + 30000);
      expect(req.throttleContext.remaining).toBe(0); // max(0, 5-6) = 0
    });

    it('should not mix throttleContext between different users', async () => {
      // User A
      const setupA = createHandleRequestProps({
        req: { user: { id: 'user-a' }, headers: {} },
      });
      await (guard as any).handleRequest(setupA.props);
      expect(setupA.req.throttleContext.userId).toBe('user-a');
      expect(setupA.req.throttleContext.throttleKey).toBe('user:user-a');

      // User B
      const setupB = createHandleRequestProps({
        req: { user: { id: 'user-b' }, headers: {} },
      });
      await (guard as any).handleRequest(setupB.props);
      expect(setupB.req.throttleContext.userId).toBe('user-b');
      expect(setupB.req.throttleContext.throttleKey).toBe('user:user-b');
    });
  });
});
