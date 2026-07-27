import { Injectable, inject } from '@angular/core';
import { Store } from '@ngxs/store';
import { Observable, throwError } from 'rxjs';
import { catchError, finalize, map, shareReplay, tap } from 'rxjs/operators';
import { RefreshTokenResponse } from '@finmate/data-models';
import { AuthService } from './auth.service';
import { Logout, RefreshTokenSuccess } from './auth.state';
import { isTokenValid } from './token.util';

/**
 * Single-flight access-token refresh.
 *
 * The backend rotates the refresh token on every `/auth/refresh` call (the old
 * one is revoked). Without coordination, concurrent 401s — common on app
 * start-up when several requests fire at once — would each call refresh with
 * the same token; the first rotates it away and the rest fail, logging the
 * user out. This service shares a single in-flight refresh across all callers.
 */
@Injectable({ providedIn: 'root' })
export class TokenRefreshService {
  private readonly authService = inject(AuthService);
  private readonly store = inject(Store);
  private inFlight$: Observable<string> | null = null;

  /**
   * Resolves to a fresh access token, or errors (after dispatching Logout) when
   * no valid refresh token exists or the server rejects it. Concurrent callers
   * share the same refresh request.
   */
  refresh(): Observable<string> {
    if (this.inFlight$) {
      return this.inFlight$;
    }

    const refreshToken = localStorage.getItem('finmate_refresh_token');
    if (!isTokenValid(refreshToken)) {
      this.store.dispatch(new Logout());
      return throwError(() => new Error('No valid refresh token'));
    }

    this.inFlight$ = this.authService.refresh(refreshToken as string).pipe(
      tap((res: RefreshTokenResponse) =>
        this.store.dispatch(
          new RefreshTokenSuccess(res.accessToken, res.refreshToken),
        ),
      ),
      map((res: RefreshTokenResponse) => res.accessToken),
      catchError((err) => {
        this.store.dispatch(new Logout());
        return throwError(() => err);
      }),
      finalize(() => {
        this.inFlight$ = null;
      }),
      shareReplay(1),
    );

    return this.inFlight$;
  }
}
