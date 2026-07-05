import { ExecutionContext, Injectable } from '@nestjs/common';
import {
  THROTTLE_POLICY_KEY,
  THROTTLE_PROFILES,
  ThrottleProfile,
} from './throttle.constants';

/**
 * Lightweight resolver that determines which throttle profile is active
 * for a given route handler or controller class.
 *
 * Uses standard Reflect.getMetadata() to read our own FINMATE:THROTTLE_POLICY
 * metadata key — no dependency on any @nestjs/throttler internals.
 *
 * Resolution order:
 *   1. Method-level metadata (set by @ThrottleAs on a route handler)
 *   2. Class-level metadata (set by @ThrottleAs on a controller class)
 *   3. Falls back to THROTTLE_PROFILES.DEFAULT
 */
@Injectable()
export class ThrottlePolicyResolver {
  /**
   * Resolve the active throttle profile for the current execution context.
   */
  resolvePolicy(context: ExecutionContext): ThrottleProfile {
    const handler = context.getHandler();
    const classRef = context.getClass();

    return (
      Reflect.getMetadata(THROTTLE_POLICY_KEY, handler) ??
      Reflect.getMetadata(THROTTLE_POLICY_KEY, classRef) ??
      THROTTLE_PROFILES.DEFAULT
    );
  }
}
