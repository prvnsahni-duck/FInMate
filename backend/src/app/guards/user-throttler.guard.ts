import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Use authenticated user id as the throttling key. Falls back to IP when unauthenticated.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected override generateKey(context: ExecutionContext): string {
    try {
      const req = context.switchToHttp().getRequest();
      const userId = req?.user?.id || req?.user?.userId;
      if (userId) return `user:${userId}`;
      // fallback to ip
      return super.generateKey(context);
    } catch {
      return super.generateKey(context);
    }
  }
}
