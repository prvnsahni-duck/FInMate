import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { Store } from '@ngxs/store';
import { AuthState } from './auth.state';
import { hasActiveSession } from './token.util';

/**
 * Guards every protected route. Access is allowed when the access token is
 * still valid, or when it has expired but a valid refresh token can silently
 * renew it (the HTTP interceptor performs the refresh on the first request).
 * Otherwise the user is redirected to Login with a returnUrl, and the route is
 * never rendered — no protected screen flashes for an unauthenticated user.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const store = inject(Store);
  const router = inject(Router);

  const accessToken = store.selectSnapshot(AuthState.getToken);
  const refreshToken = store.selectSnapshot(AuthState.getRefreshToken);

  if (hasActiveSession(accessToken, refreshToken)) {
    return true;
  }

  return router.createUrlTree(['/auth/login'], {
    queryParams: { returnUrl: state.url },
  });
};
