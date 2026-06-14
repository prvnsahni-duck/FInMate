import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode = 'SYS_INTERNAL_ERROR';
    let message = 'An unexpected internal server error occurred';
    let details: { field: string; issue: string }[] | undefined = undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const resBody = exception.getResponse() as any;

      if (typeof resBody === 'string') {
        message = resBody;
      } else if (typeof resBody === 'object' && resBody !== null) {
        message = resBody.message || exception.message;
        if (resBody.errorCode) {
          errorCode = resBody.errorCode;
        }
        if (resBody.details) {
          details = resBody.details;
        }

        // Extract class-validator array formatting
        if (statusCode === HttpStatus.BAD_REQUEST && Array.isArray(resBody.message)) {
          errorCode = 'VAL_INVALID_INPUT';
          message = 'Input validation failed';
          details = [];
          for (const msg of resBody.message) {
            if (typeof msg === 'string') {
              const firstSpace = msg.indexOf(' ');
              if (firstSpace !== -1) {
                const field = msg.substring(0, firstSpace);
                const issue = msg.substring(firstSpace + 1);
                details.push({ field, issue });
              } else {
                details.push({ field: 'input', issue: msg });
              }
            }
          }
        }
      }
    } else if (exception instanceof QueryFailedError) {
      const driverError = exception.driverError;
      this.logger.error(`Database Exception: ${exception.message}`, exception.stack);

      if (driverError && driverError.code === '23505') {
        statusCode = HttpStatus.CONFLICT;
        errorCode = 'RES_ALREADY_EXISTS';
        message = driverError.detail || 'Database unique constraint violation: resource already exists';
      } else if (driverError && driverError.code === '23503') {
        statusCode = HttpStatus.BAD_REQUEST;
        errorCode = 'VAL_INVALID_INPUT';
        message = driverError.detail || 'Database foreign key constraint violation: referenced resource does not exist';
      } else {
        statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
        errorCode = 'SYS_INTERNAL_ERROR';
        message = 'Database query operation failed';
      }
    } else {
      // Unhandled generic errors
      const err = exception as Error;
      this.logger.error(`Unhandled Exception: ${err?.message || exception}`, err?.stack);
    }

    // Map status codes to custom error codes if they weren't explicitly set above
    if (errorCode === 'SYS_INTERNAL_ERROR' && statusCode !== HttpStatus.INTERNAL_SERVER_ERROR) {
      switch (statusCode) {
        case HttpStatus.BAD_REQUEST:
          errorCode = 'VAL_INVALID_INPUT';
          break;
        case HttpStatus.UNAUTHORIZED:
          const msgStr = String(message).toLowerCase();
          if (msgStr.includes('expired')) {
            errorCode = 'AUTH_TOKEN_EXPIRED';
          } else if (msgStr.includes('missing') || msgStr.includes('authorization')) {
            errorCode = 'AUTH_MISSING_TOKEN';
          } else {
            errorCode = 'AUTH_INVALID_TOKEN';
          }
          break;
        case HttpStatus.FORBIDDEN:
          errorCode = 'RES_FORBIDDEN';
          break;
        case HttpStatus.NOT_FOUND:
          errorCode = 'RES_NOT_FOUND';
          break;
        case HttpStatus.CONFLICT:
          errorCode = 'RES_ALREADY_EXISTS';
          break;
        case HttpStatus.PRECONDITION_FAILED:
          errorCode = 'CON_VERSION_CONFLICT';
          break;
        case HttpStatus.TOO_MANY_REQUESTS:
          errorCode = 'CON_LIMIT_RATE';
          break;
        case HttpStatus.SERVICE_UNAVAILABLE:
          errorCode = 'SYS_SERVICE_UNAVAILABLE';
          break;
        case HttpStatus.GATEWAY_TIMEOUT:
          errorCode = 'SYS_TIMEOUT';
          break;
      }
    }

    // Define retryability based on error classifications
    const retryable = [
      'CON_VERSION_CONFLICT',
      'CON_LIMIT_RATE',
      'SYS_SERVICE_UNAVAILABLE',
      'SYS_TIMEOUT'
    ].includes(errorCode);

    const errorPayload = {
      statusCode,
      timestamp: new Date().toISOString(),
      path: request.url,
      errorCode,
      message: typeof message === 'string' ? message : String(message),
      details,
      retryable,
    };

    response.status(statusCode).send(errorPayload);
  }
}
