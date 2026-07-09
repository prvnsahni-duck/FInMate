import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';

const logger = new Logger('ConditionalThrottleGuard');

@Injectable()
export class ConditionalThrottleGuard implements CanActivate {
  constructor(
    private readonly throttler: ThrottlerGuard,
    private readonly configService: ConfigService,
  ) {}

  private isE2E(): boolean {
    const appEnv = process.env.APP_ENV || process.env.NODE_ENV || '';
    const throttleSkip = (process.env.THROTTLE_SKIP || '').toLowerCase();
    const e2e = appEnv.toLowerCase() === 'e2e' || appEnv.toLowerCase() === 'e2e';
    const nodeE2E = (process.env.NODE_ENV || '').toLowerCase() === 'e2e';
    const skip = throttleSkip === 'true';
    const result = e2e || nodeE2E || skip;
    logger.debug(
      `E2E detection => APP_ENV=${process.env.APP_ENV || ''} NODE_ENV=${process.env.NODE_ENV || ''} THROTTLE_SKIP=${process.env.THROTTLE_SKIP || ''} => isE2E=${result}`,
    );
    return result;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const rateLimitEnabled = this.configService.get<boolean>('RATE_LIMIT_ENABLED', true);
      if (!rateLimitEnabled) {
        return true;
      }

      // If process is running in E2E mode, bypass throttling globally for automation
      if (this.isE2E()) return true;
      return this.throttler.canActivate(context) as Promise<boolean>;
    } catch (err) {
      return this.throttler.canActivate(context) as Promise<boolean>;
    }
  }
}
