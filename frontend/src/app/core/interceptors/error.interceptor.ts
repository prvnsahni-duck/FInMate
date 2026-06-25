import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { ErrorResponse } from '@finmate/data-models';
import { catchError, throwError } from 'rxjs';

export interface AppHttpErrorEventDetail {
  status: number;
  message: string;
  errorCode?: string;
  retryable?: boolean;
}

export const APP_HTTP_ERROR_EVENT = 'finmate:http-error';

function normalizeError(error: HttpErrorResponse): AppHttpErrorEventDetail {
  const body = error.error as Partial<ErrorResponse> | string | null;

  if (typeof body === 'object' && body !== null) {
    return {
      status: error.status,
      message: typeof body.message === 'string' ? body.message : error.message,
      errorCode: body.errorCode,
      retryable: body.retryable,
    };
  }

  return {
    status: error.status,
    message: typeof body === 'string' && body.length > 0 ? body : error.message,
  };
}

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        const detail = normalizeError(error);

        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent<AppHttpErrorEventDetail>(APP_HTTP_ERROR_EVENT, {
              detail,
            }),
          );
        }
      }

      return throwError(() => error);
    }),
  );
};
