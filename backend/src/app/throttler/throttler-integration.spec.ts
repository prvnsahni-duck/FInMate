import { ExecutionContext } from '@nestjs/common';
import { ThrottlePolicyResolver } from './throttle-policy.resolver';
import { THROTTLE_POLICY_KEY, THROTTLE_PROFILES } from './throttle.constants';

/**
 * Integration tests verifying that the skipIf + ThrottlePolicyResolver architecture
 * correctly isolates throttle profiles so that unrelated counters are never incremented.
 *
 * These tests simulate the exact evaluation path that NestJS ThrottlerGuard.canActivate()
 * follows: for each profile, call skipIf(ctx). If skipIf returns true, the profile is skipped
 * and its Redis counter is never touched.
 */
describe('Throttler Profile Isolation (Integration)', () => {
  let resolver: ThrottlePolicyResolver;
  let redisCounters: Record<string, number>;

  // Simulates what NestJS ThrottlerGuard does internally
  function simulateThrottlerLoop(context: ExecutionContext): string[] {
    const allProfiles = Object.values(THROTTLE_PROFILES);
    const executedProfiles: string[] = [];

    for (const profileName of allProfiles) {
      // This is the exact skipIf logic wired in app.module.ts
      const shouldSkip = resolver.resolvePolicy(context) !== profileName;
      if (shouldSkip) {
        continue; // Profile skipped — no counter increment
      }

      // Profile NOT skipped — counter would be incremented
      executedProfiles.push(profileName);
      redisCounters[profileName] = (redisCounters[profileName] || 0) + 1;
    }

    return executedProfiles;
  }

  function createContext(
    handlerMeta?: string,
    classMeta?: string,
  ): ExecutionContext {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const handler = function routeHandler() {};
    const classRef = class Controller {};

    if (handlerMeta !== undefined) {
      Reflect.defineMetadata(THROTTLE_POLICY_KEY, handlerMeta, handler);
    }
    if (classMeta !== undefined) {
      Reflect.defineMetadata(THROTTLE_POLICY_KEY, classMeta, classRef);
    }

    return {
      getHandler: () => handler,
      getClass: () => classRef,
      switchToHttp: () => ({
        getRequest: () => ({}),
        getResponse: () => ({}),
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    resolver = new ThrottlePolicyResolver();
    redisCounters = {};
  });

  // ─── Undecorated Endpoints (Groups, Expenses, Users, etc.) ───────────────

  describe('GET /groups (undecorated)', () => {
    it('should execute ONLY the default profile', () => {
      const ctx = createContext(); // no decorator
      const executed = simulateThrottlerLoop(ctx);

      expect(executed).toEqual([THROTTLE_PROFILES.DEFAULT]);
    });

    it('should never increment forgotPassword counter after 4 requests', () => {
      const ctx = createContext();

      simulateThrottlerLoop(ctx);
      simulateThrottlerLoop(ctx);
      simulateThrottlerLoop(ctx);
      simulateThrottlerLoop(ctx);

      expect(redisCounters[THROTTLE_PROFILES.DEFAULT]).toBe(4);
      expect(redisCounters[THROTTLE_PROFILES.FORGOT_PASSWORD]).toBeUndefined();
      expect(redisCounters[THROTTLE_PROFILES.RESET_PASSWORD]).toBeUndefined();
      expect(redisCounters[THROTTLE_PROFILES.LOGIN]).toBeUndefined();
      expect(redisCounters[THROTTLE_PROFILES.REGISTER]).toBeUndefined();
      expect(redisCounters[THROTTLE_PROFILES.OTP]).toBeUndefined();
      expect(redisCounters[THROTTLE_PROFILES.REFRESH]).toBeUndefined();
      expect(redisCounters[THROTTLE_PROFILES.IMPORT]).toBeUndefined();
      expect(redisCounters[THROTTLE_PROFILES.EXPORT]).toBeUndefined();
    });
  });

  describe('GET /expenses (undecorated)', () => {
    it('should execute ONLY the default profile', () => {
      const ctx = createContext();
      const executed = simulateThrottlerLoop(ctx);

      expect(executed).toEqual([THROTTLE_PROFILES.DEFAULT]);
    });

    it('should never increment any non-default counter after 4 requests', () => {
      const ctx = createContext();

      for (let i = 0; i < 4; i++) {
        simulateThrottlerLoop(ctx);
      }

      expect(redisCounters[THROTTLE_PROFILES.DEFAULT]).toBe(4);
      // All other counters must be untouched
      const nonDefaultProfiles = Object.values(THROTTLE_PROFILES).filter(
        (p) => p !== THROTTLE_PROFILES.DEFAULT,
      );
      for (const profile of nonDefaultProfiles) {
        expect(redisCounters[profile]).toBeUndefined();
      }
    });
  });

  describe('POST /expenses, PATCH /expenses, DELETE /expenses (undecorated)', () => {
    it('should all execute ONLY the default profile', () => {
      // These are all undecorated routes on ExpensesController
      const postCtx = createContext();
      const patchCtx = createContext();
      const deleteCtx = createContext();

      expect(simulateThrottlerLoop(postCtx)).toEqual([
        THROTTLE_PROFILES.DEFAULT,
      ]);
      expect(simulateThrottlerLoop(patchCtx)).toEqual([
        THROTTLE_PROFILES.DEFAULT,
      ]);
      expect(simulateThrottlerLoop(deleteCtx)).toEqual([
        THROTTLE_PROFILES.DEFAULT,
      ]);

      expect(redisCounters[THROTTLE_PROFILES.DEFAULT]).toBe(3);
      expect(redisCounters[THROTTLE_PROFILES.FORGOT_PASSWORD]).toBeUndefined();
    });
  });

  // ─── Auth Endpoints ──────────────────────────────────────────────────────

  describe('POST /auth/login (@ThrottleAs LOGIN)', () => {
    it('should execute ONLY the login profile', () => {
      const ctx = createContext(THROTTLE_PROFILES.LOGIN);
      const executed = simulateThrottlerLoop(ctx);

      expect(executed).toEqual([THROTTLE_PROFILES.LOGIN]);
    });

    it('should not increment default counter', () => {
      const ctx = createContext(THROTTLE_PROFILES.LOGIN);
      simulateThrottlerLoop(ctx);

      expect(redisCounters[THROTTLE_PROFILES.LOGIN]).toBe(1);
      expect(redisCounters[THROTTLE_PROFILES.DEFAULT]).toBeUndefined();
    });
  });

  describe('POST /auth/register (@ThrottleAs REGISTER)', () => {
    it('should execute ONLY the register profile', () => {
      const ctx = createContext(THROTTLE_PROFILES.REGISTER);
      const executed = simulateThrottlerLoop(ctx);

      expect(executed).toEqual([THROTTLE_PROFILES.REGISTER]);
      expect(redisCounters[THROTTLE_PROFILES.DEFAULT]).toBeUndefined();
    });
  });

  describe('POST /auth/refresh (@ThrottleAs REFRESH)', () => {
    it('should execute ONLY the refresh profile', () => {
      const ctx = createContext(THROTTLE_PROFILES.REFRESH);
      const executed = simulateThrottlerLoop(ctx);

      expect(executed).toEqual([THROTTLE_PROFILES.REFRESH]);
    });
  });

  describe('POST /auth/2fa/verify (@ThrottleAs OTP)', () => {
    it('should execute ONLY the otp profile', () => {
      const ctx = createContext(THROTTLE_PROFILES.OTP);
      const executed = simulateThrottlerLoop(ctx);

      expect(executed).toEqual([THROTTLE_PROFILES.OTP]);
    });
  });

  // ─── Import/Export Endpoints ─────────────────────────────────────────────

  describe('POST /import/expenses (@ThrottleAs IMPORT)', () => {
    it('should execute ONLY the import profile', () => {
      const ctx = createContext(THROTTLE_PROFILES.IMPORT);
      const executed = simulateThrottlerLoop(ctx);

      expect(executed).toEqual([THROTTLE_PROFILES.IMPORT]);
      expect(redisCounters[THROTTLE_PROFILES.DEFAULT]).toBeUndefined();
    });
  });

  describe('GET /export/expenses (@ThrottleAs EXPORT)', () => {
    it('should execute ONLY the export profile', () => {
      const ctx = createContext(THROTTLE_PROFILES.EXPORT);
      const executed = simulateThrottlerLoop(ctx);

      expect(executed).toEqual([THROTTLE_PROFILES.EXPORT]);
      expect(redisCounters[THROTTLE_PROFILES.DEFAULT]).toBeUndefined();
    });
  });

  // ─── Reserved Profiles ───────────────────────────────────────────────────

  describe('forgotPassword and resetPassword (reserved, no routes yet)', () => {
    it('should execute forgotPassword ONLY when explicitly decorated', () => {
      const ctx = createContext(THROTTLE_PROFILES.FORGOT_PASSWORD);
      const executed = simulateThrottlerLoop(ctx);

      expect(executed).toEqual([THROTTLE_PROFILES.FORGOT_PASSWORD]);
    });

    it('should execute resetPassword ONLY when explicitly decorated', () => {
      const ctx = createContext(THROTTLE_PROFILES.RESET_PASSWORD);
      const executed = simulateThrottlerLoop(ctx);

      expect(executed).toEqual([THROTTLE_PROFILES.RESET_PASSWORD]);
    });
  });

  // ─── Cross-Endpoint Isolation ────────────────────────────────────────────

  describe('cross-endpoint isolation', () => {
    it('GET /groups x2 then POST /auth/login x1 → login=1, default=2', () => {
      const groupsCtx = createContext(); // undecorated
      const loginCtx = createContext(THROTTLE_PROFILES.LOGIN);

      simulateThrottlerLoop(groupsCtx);
      simulateThrottlerLoop(groupsCtx);
      simulateThrottlerLoop(loginCtx);

      expect(redisCounters[THROTTLE_PROFILES.DEFAULT]).toBe(2);
      expect(redisCounters[THROTTLE_PROFILES.LOGIN]).toBe(1);
      expect(redisCounters[THROTTLE_PROFILES.FORGOT_PASSWORD]).toBeUndefined();
    });

    it('interleaved requests across all profile types maintain independent counters', () => {
      simulateThrottlerLoop(createContext()); // default
      simulateThrottlerLoop(createContext(THROTTLE_PROFILES.LOGIN));
      simulateThrottlerLoop(createContext()); // default
      simulateThrottlerLoop(createContext(THROTTLE_PROFILES.REGISTER));
      simulateThrottlerLoop(createContext(THROTTLE_PROFILES.IMPORT));
      simulateThrottlerLoop(createContext()); // default

      expect(redisCounters[THROTTLE_PROFILES.DEFAULT]).toBe(3);
      expect(redisCounters[THROTTLE_PROFILES.LOGIN]).toBe(1);
      expect(redisCounters[THROTTLE_PROFILES.REGISTER]).toBe(1);
      expect(redisCounters[THROTTLE_PROFILES.IMPORT]).toBe(1);
      expect(redisCounters[THROTTLE_PROFILES.FORGOT_PASSWORD]).toBeUndefined();
      expect(redisCounters[THROTTLE_PROFILES.RESET_PASSWORD]).toBeUndefined();
      expect(redisCounters[THROTTLE_PROFILES.OTP]).toBeUndefined();
      expect(redisCounters[THROTTLE_PROFILES.REFRESH]).toBeUndefined();
      expect(redisCounters[THROTTLE_PROFILES.EXPORT]).toBeUndefined();
    });
  });

  // ─── Inherited Decorator Tests ───────────────────────────────────────────

  describe('class-level decorator inheritance', () => {
    it('class-level @ThrottleAs applies to all undecorated methods', () => {
      const ctx = createContext(undefined, THROTTLE_PROFILES.LOGIN);
      const executed = simulateThrottlerLoop(ctx);

      expect(executed).toEqual([THROTTLE_PROFILES.LOGIN]);
    });

    it('method-level decorator overrides class-level decorator', () => {
      const ctx = createContext(THROTTLE_PROFILES.OTP, THROTTLE_PROFILES.LOGIN);
      const executed = simulateThrottlerLoop(ctx);

      expect(executed).toEqual([THROTTLE_PROFILES.OTP]);
    });
  });
});
