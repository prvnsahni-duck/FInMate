import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Use authenticated user id as the throttling key. Falls back to IP when unauthenticated.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected override generateKey(
    context: ExecutionContext,
    tracker: string,
    name: string,
  ): string {
    try {
      const req = context.switchToHttp().getRequest();
      let userId = req?.user?.id || req?.user?.userId;

      // Extract user ID manually from Authorization bearer token if req.user is not yet populated
      if (!userId) {
        const authHeader = req?.headers?.authorization;
        if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
          const token = authHeader.substring(7);
          const parts = token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(
              Buffer.from(parts[1], 'base64').toString('utf8'),
            );
            userId = payload?.userId || payload?.id || payload?.sub;
          }
        }
      }

      const keySuffix = userId ? `user:${userId}` : tracker;
      return super.generateKey(context, keySuffix, name);
    } catch {
      return super.generateKey(context, tracker, name);
    }
  }
}
