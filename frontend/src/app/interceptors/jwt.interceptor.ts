import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Store } from '@ngxs/store';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { Logout, RefreshTokenSuccess } from '../state/auth.state';

export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const store = inject(Store);
  const authService = inject(AuthService);
  const token = localStorage.getItem('finmate_token');

  let authReq = req;
  if (token) {
    authReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  return next(authReq).pipe(
    catchError((error) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !req.url.includes('/auth/login') &&
        !req.url.includes('/auth/refresh')
      ) {
        const refreshToken = localStorage.getItem('finmate_refresh_token');
        if (refreshToken) {
          return authService.refresh(refreshToken).pipe(
            switchMap((res: any) => {
              store.dispatch(new RefreshTokenSuccess(res.accessToken, res.refreshToken));
              const retryReq = req.clone({
                setHeaders: {
                  Authorization: `Bearer ${res.accessToken}`
                }
              });
              return next(retryReq);
            }),
            catchError((refreshErr) => {
              store.dispatch(new Logout());
              return throwError(() => refreshErr);
            })
          );
        } else {
          store.dispatch(new Logout());
        }
      }
      return throwError(() => error);
    })
  );
};
