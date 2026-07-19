import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerRequest } from '@nestjs/throttler';

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
        if (
          authHeader &&
          typeof authHeader === 'string' &&
          authHeader.startsWith('Bearer ')
        ) {
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

  protected override async handleRequest(
    requestProps: ThrottlerRequest,
  ): Promise<boolean> {
    const {
      context,
      limit,
      ttl,
      throttler,
      blockDuration,
      getTracker,
      generateKey,
    } = requestProps;
    const { req, res } = this.getRequestResponse(context);

    const ignoreUserAgents =
      throttler.ignoreUserAgents ?? this.commonOptions.ignoreUserAgents;
    if (Array.isArray(ignoreUserAgents)) {
      for (const pattern of ignoreUserAgents) {
        if (pattern.test(req.headers['user-agent'])) {
          return true;
        }
      }
    }

    const tracker = await getTracker(req, context);
    const key = generateKey(context, tracker, throttler.name);

    // Increment hits count
    const { totalHits, timeToExpire, isBlocked, timeToBlockExpire } =
      await this.storageService.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttler.name,
      );

    // Extract user ID for human-readable logging of the throttle key
    let userId = req?.user?.id || req?.user?.userId;
    if (!userId) {
      const authHeader = req?.headers?.authorization;
      if (
        authHeader &&
        typeof authHeader === 'string' &&
        authHeader.startsWith('Bearer ')
      ) {
        try {
          const token = authHeader.substring(7);
          const parts = token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(
              Buffer.from(parts[1], 'base64').toString('utf8'),
            );
            userId = payload?.userId || payload?.id || payload?.sub;
          }
        } catch {
          // ignore parsing error
        }
      }
    }

    // Attach throttle context to the request for downstream consumers
    // (HttpExceptionFilter, LoggingInterceptor).
    // This replaces the old req.rateLimitInfo with a cleaner, dedicated object.
    req.throttleContext = {
      userId: userId || 'anonymous',
      profile: throttler.name,
      limit,
      remaining: Math.max(0, limit - totalHits),
      retryAfter: isBlocked ? timeToBlockExpire : 0,
      blockedUntil: isBlocked ? Date.now() + timeToBlockExpire * 1000 : 0,
      throttleKey: userId ? `user:${userId}` : tracker,
    };

    const getThrottlerSuffix = (name: string) =>
      name === 'default' ? '' : `-${name}`;
    const setHeaders =
      throttler.setHeaders ?? this.commonOptions.setHeaders ?? true;

    if (isBlocked) {
      if (setHeaders) {
        res.header(
          `Retry-After${getThrottlerSuffix(throttler.name)}`,
          timeToBlockExpire,
        );
      }
      await this.throwThrottlingException(context, {
        limit,
        ttl,
        key,
        tracker,
        totalHits,
        timeToExpire,
        isBlocked,
        timeToBlockExpire,
      });
    }

    if (setHeaders) {
      res.header(
        `${this.headerPrefix}-Limit${getThrottlerSuffix(throttler.name)}`,
        limit,
      );
      res.header(
        `${this.headerPrefix}-Remaining${getThrottlerSuffix(throttler.name)}`,
        Math.max(0, limit - totalHits),
      );
      res.header(
        `${this.headerPrefix}-Reset${getThrottlerSuffix(throttler.name)}`,
        timeToExpire,
      );
    }

    return true;
  }
}
