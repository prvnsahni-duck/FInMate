import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('RequestLogger');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest();
    const res = ctx.getResponse();

    if (!req.startTime) {
      req.startTime = Date.now();
    }

    return next.handle().pipe(
      tap({
        next: () => {
          this.logRequest(req, res);
        },
        error: (err) => {
          this.logRequest(req, res, err);
        },
      }),
    );
  }

  private logRequest(req: any, res: any, error?: any) {
    const timestamp = new Date().toISOString();
    const method = req.method;
    const url = req.originalUrl || req.url;
    const ip =
      req.ip ||
      req.headers['x-forwarded-for'] ||
      req.socket?.remoteAddress ||
      null;
    const responseTime = req.startTime
      ? `${Date.now() - req.startTime}ms`
      : 'N/A';
    const status = error
      ? error.status || error.statusCode || 500
      : res.statusCode;
    const userId =
      req?.user?.id ||
      req?.user?.userId ||
      req?.throttleContext?.userId ||
      'anonymous';

    const throttleCtx = req?.throttleContext || {};
    const throttleKey = throttleCtx.throttleKey || ip;
    const limit = throttleCtx.limit !== undefined ? throttleCtx.limit : 'N/A';
    const remaining =
      throttleCtx.remaining !== undefined ? throttleCtx.remaining : 'N/A';

    const logMessage = JSON.stringify({
      timestamp,
      method,
      url,
      userId,
      ip,
      status,
      responseTime,
      throttleKey,
      limit,
      remaining,
    });

    if (status >= 500) {
      this.logger.error(logMessage);
    } else if (status >= 400) {
      this.logger.warn(logMessage);
    } else {
      this.logger.log(logMessage);
    }
  }
}
