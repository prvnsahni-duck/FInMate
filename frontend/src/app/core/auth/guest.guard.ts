import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { Store } from '@ngxs/store';
import { AuthState } from './auth.state';
import { hasActiveSession } from './token.util';

/**
 * Guards the auth screens (login/register). An already-authenticated user must
 * never see the Login screen — send them to the dashboard instead. Uses the
 * same session check as `authGuard`, so the two can never bounce the user back
 * and forth (no redirect loop).
 */
export const guestGuard: CanActivateFn = () => {
  const store = inject(Store);
  const router = inject(Router);

  const accessToken = store.selectSnapshot(AuthState.getToken);
  const refreshToken = store.selectSnapshot(AuthState.getRefreshToken);

  if (hasActiveSession(accessToken, refreshToken)) {
    return router.createUrlTree(['/dashboard']);
  }
  return true;
};
