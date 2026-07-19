import { ExecutionContext } from '@nestjs/common';
import { ThrottlePolicyResolver } from './throttle-policy.resolver';
import { THROTTLE_POLICY_KEY, THROTTLE_PROFILES } from './throttle.constants';

describe('ThrottlePolicyResolver', () => {
  let resolver: ThrottlePolicyResolver;

  beforeEach(() => {
    resolver = new ThrottlePolicyResolver();
  });

  it('should be defined', () => {
    expect(resolver).toBeDefined();
  });

  /**
   * Helper to create a mock ExecutionContext with optional metadata on handler and/or class.
   */
  function createMockContext(
    handlerMeta?: string,
    classMeta?: string,
  ): ExecutionContext {
    const handler = function testHandler() {};
    const classRef = class TestController {};

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

  describe('resolvePolicy', () => {
    it('should return "default" for undecorated handler and class', () => {
      const ctx = createMockContext();
      expect(resolver.resolvePolicy(ctx)).toBe(THROTTLE_PROFILES.DEFAULT);
    });

    it('should return "login" when handler has @ThrottlePolicy(LOGIN)', () => {
      const ctx = createMockContext(THROTTLE_PROFILES.LOGIN);
      expect(resolver.resolvePolicy(ctx)).toBe(THROTTLE_PROFILES.LOGIN);
    });

    it('should return "register" when handler has @ThrottlePolicy(REGISTER)', () => {
      const ctx = createMockContext(THROTTLE_PROFILES.REGISTER);
      expect(resolver.resolvePolicy(ctx)).toBe(THROTTLE_PROFILES.REGISTER);
    });

    it('should return "forgotPassword" when handler has @ThrottlePolicy(FORGOT_PASSWORD)', () => {
      const ctx = createMockContext(THROTTLE_PROFILES.FORGOT_PASSWORD);
      expect(resolver.resolvePolicy(ctx)).toBe(
        THROTTLE_PROFILES.FORGOT_PASSWORD,
      );
    });

    it('should return "resetPassword" when handler has @ThrottlePolicy(RESET_PASSWORD)', () => {
      const ctx = createMockContext(THROTTLE_PROFILES.RESET_PASSWORD);
      expect(resolver.resolvePolicy(ctx)).toBe(
        THROTTLE_PROFILES.RESET_PASSWORD,
      );
    });

    it('should return "otp" when handler has @ThrottlePolicy(OTP)', () => {
      const ctx = createMockContext(THROTTLE_PROFILES.OTP);
      expect(resolver.resolvePolicy(ctx)).toBe(THROTTLE_PROFILES.OTP);
    });

    it('should return "refresh" when handler has @ThrottlePolicy(REFRESH)', () => {
      const ctx = createMockContext(THROTTLE_PROFILES.REFRESH);
      expect(resolver.resolvePolicy(ctx)).toBe(THROTTLE_PROFILES.REFRESH);
    });

    it('should return "import" when handler has @ThrottlePolicy(IMPORT)', () => {
      const ctx = createMockContext(THROTTLE_PROFILES.IMPORT);
      expect(resolver.resolvePolicy(ctx)).toBe(THROTTLE_PROFILES.IMPORT);
    });

    it('should return "export" when handler has @ThrottlePolicy(EXPORT)', () => {
      const ctx = createMockContext(THROTTLE_PROFILES.EXPORT);
      expect(resolver.resolvePolicy(ctx)).toBe(THROTTLE_PROFILES.EXPORT);
    });

    it('should use class-level metadata when handler has none', () => {
      const ctx = createMockContext(undefined, THROTTLE_PROFILES.LOGIN);
      expect(resolver.resolvePolicy(ctx)).toBe(THROTTLE_PROFILES.LOGIN);
    });

    it('should prefer method-level metadata over class-level', () => {
      const ctx = createMockContext(
        THROTTLE_PROFILES.OTP,
        THROTTLE_PROFILES.LOGIN,
      );
      expect(resolver.resolvePolicy(ctx)).toBe(THROTTLE_PROFILES.OTP);
    });

    it('should return "default" when class has metadata but method overrides to default', () => {
      const ctx = createMockContext(
        THROTTLE_PROFILES.DEFAULT,
        THROTTLE_PROFILES.LOGIN,
      );
      expect(resolver.resolvePolicy(ctx)).toBe(THROTTLE_PROFILES.DEFAULT);
    });
  });
});
