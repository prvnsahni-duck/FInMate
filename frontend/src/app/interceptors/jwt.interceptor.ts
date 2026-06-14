import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Store } from '@ngxs/store';
// We will create AuthState soon
// import { AuthState } from '../state/auth.state';

export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const store = inject(Store);
  // Get token from AuthState when implemented, or localStorage for now
  const token = localStorage.getItem('finmate_token');

  if (token) {
    req = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  return next(req);
};
