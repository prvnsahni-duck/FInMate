import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { TokenRefreshService } from '../auth/token-refresh.service';

/**
 * Attaches the access token to outgoing requests and transparently recovers
 * from an expired one: on a 401 (other than the auth endpoints themselves) it
 * asks {@link TokenRefreshService} for a fresh token — a single shared refresh
 * across all concurrent 401s — then retries the original request. If the
 * refresh fails, that service clears the session and redirects to Login, so
 * here we simply propagate the error.
 */
export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenRefresh = inject(TokenRefreshService);
  const token = localStorage.getItem('finmate_token');

  const authReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authReq).pipe(
    catchError((error) => {
      const isAuthEndpoint =
        req.url.includes('/auth/login') ||
        req.url.includes('/auth/register') ||
        req.url.includes('/auth/refresh');

      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !isAuthEndpoint
      ) {
        return tokenRefresh.refresh().pipe(
          switchMap((accessToken) =>
            next(
              req.clone({
                setHeaders: { Authorization: `Bearer ${accessToken}` },
              }),
            ),
          ),
        );
      }

      return throwError(() => error);
    }),
  );
};
