import { applyDecorators, SetMetadata } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { THROTTLE_POLICY_KEY, ThrottleProfile } from './throttle.constants';

/**
 * Internal decorator — sets our custom metadata key to signal which
 * throttle profile should be active for a route.
 *
 * Do NOT export this from barrel files. Use @ThrottleAs() instead.
 */
function ThrottlePolicy(profile: ThrottleProfile) {
  return SetMetadata(THROTTLE_POLICY_KEY, profile);
}

/**
 * Public decorator — the single supported API for assigning a throttle
 * profile to a controller class or route handler.
 *
 * Combines two decorators in one:
 *   1. Sets our custom FINMATE:THROTTLE_POLICY metadata (read by ThrottlePolicyResolver)
 *   2. Sets the NestJS @Throttle() decorator for the named profile (tells NestJS
 *      to use that profile's configured limit/ttl overrides)
 *
 * Usage:
 *   @ThrottleAs(THROTTLE_PROFILES.LOGIN)
 *   @Post('login')
 *   async login() { ... }
 */
export function ThrottleAs(profile: ThrottleProfile) {
  return applyDecorators(
    ThrottlePolicy(profile),
    Throttle({ [profile]: {} }),
  );
}
