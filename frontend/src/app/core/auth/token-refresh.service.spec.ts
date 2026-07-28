import { TestBed } from '@angular/core/testing';
import { Store } from '@ngxs/store';
import { Subject } from 'rxjs';
import { RefreshTokenResponse } from '@finmate/data-models';
import { TokenRefreshService } from './token-refresh.service';
import { AuthService } from './auth.service';
import { Logout, RefreshTokenSuccess } from './auth.state';

function jwt(expOffsetSeconds: number): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'none' })}.${b64({ exp: Math.floor(Date.now() / 1000) + expOffsetSeconds })}.sig`;
}

describe('TokenRefreshService', () => {
  let service: TokenRefreshService;
  let refresh$: Subject<RefreshTokenResponse>;
  let authService: { refresh: jest.Mock };
  let store: { dispatch: jest.Mock };

  beforeEach(() => {
    localStorage.clear();
    refresh$ = new Subject<RefreshTokenResponse>();
    authService = { refresh: jest.fn(() => refresh$.asObservable()) };
    store = { dispatch: jest.fn() };
    TestBed.configureTestingModule({
      providers: [
        TokenRefreshService,
        { provide: AuthService, useValue: authService },
        { provide: Store, useValue: store },
      ],
    });
    service = TestBed.inject(TokenRefreshService);
  });

  it('shares a single refresh request across concurrent callers (no logout storm)', () => {
    localStorage.setItem('finmate_refresh_token', jwt(600));

    const results: string[] = [];
    service.refresh().subscribe((t) => results.push(t));
    service.refresh().subscribe((t) => results.push(t));
    service.refresh().subscribe((t) => results.push(t));

    // Only ONE network refresh despite three concurrent callers.
    expect(authService.refresh).toHaveBeenCalledTimes(1);

    refresh$.next({ accessToken: 'new-access', refreshToken: 'new-refresh' });
    refresh$.complete();

    expect(results).toEqual(['new-access', 'new-access', 'new-access']);
    expect(store.dispatch).toHaveBeenCalledWith(
      new RefreshTokenSuccess('new-access', 'new-refresh'),
    );
    // No logout on success.
    expect(store.dispatch).not.toHaveBeenCalledWith(expect.any(Logout));
  });

  it('starts a fresh refresh after the previous one completes', () => {
    localStorage.setItem('finmate_refresh_token', jwt(600));

    service.refresh().subscribe();
    refresh$.next({ accessToken: 'a1', refreshToken: 'r1' });
    refresh$.complete();

    // New cycle -> new underlying request.
    refresh$ = new Subject<RefreshTokenResponse>();
    authService.refresh.mockReturnValue(refresh$.asObservable());
    service.refresh().subscribe();
    expect(authService.refresh).toHaveBeenCalledTimes(2);
  });

  it('logs out (once) and errors when the server rejects the refresh token', () => {
    localStorage.setItem('finmate_refresh_token', jwt(600));

    const errors: unknown[] = [];
    service.refresh().subscribe({ error: (e) => errors.push(e) });
    service.refresh().subscribe({ error: (e) => errors.push(e) });

    refresh$.error(new Error('401'));

    expect(errors).toHaveLength(2);
    const logoutDispatches = store.dispatch.mock.calls.filter(
      (c) => c[0] instanceof Logout,
    );
    expect(logoutDispatches).toHaveLength(1);
  });

  it('logs out immediately when there is no valid refresh token', () => {
    // no token in storage
    let errored = false;
    service.refresh().subscribe({ error: () => (errored = true) });

    expect(authService.refresh).not.toHaveBeenCalled();
    expect(store.dispatch).toHaveBeenCalledWith(expect.any(Logout));
    expect(errored).toBe(true);
  });
});
