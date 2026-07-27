import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { Store } from '@ngxs/store';
import { authGuard } from './auth.guard';
import { guestGuard } from './guest.guard';
import { AuthState } from './auth.state';

function jwt(expOffsetSeconds: number): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'none' })}.${b64({ exp: Math.floor(Date.now() / 1000) + expOffsetSeconds })}.sig`;
}
const validJwt = () => jwt(600);
const expiredJwt = () => jwt(-10);

describe('auth route guards', () => {
  let selectSnapshot: jest.Mock;
  let createUrlTree: jest.Mock;

  function configure(access: string | null, refresh: string | null) {
    selectSnapshot = jest.fn((selector: unknown) => {
      if (selector === AuthState.getToken) return access;
      if (selector === AuthState.getRefreshToken) return refresh;
      return null;
    });
    createUrlTree = jest.fn(
      (commands: unknown[]) => ({ __urlTree: commands }) as unknown as UrlTree,
    );
    TestBed.configureTestingModule({
      providers: [
        { provide: Store, useValue: { selectSnapshot } },
        { provide: Router, useValue: { createUrlTree } },
      ],
    });
  }

  const routeStub = {} as any;
  const stateStub = { url: '/groups/123' } as any;
  const run = (guard: typeof authGuard) =>
    TestBed.runInInjectionContext(() => guard(routeStub, stateStub));

  describe('authGuard', () => {
    it('allows access with a valid access token', () => {
      configure(validJwt(), null);
      expect(run(authGuard)).toBe(true);
    });

    it('allows access when access is expired but refresh is valid', () => {
      configure(expiredJwt(), validJwt());
      expect(run(authGuard)).toBe(true);
    });

    it('redirects to /auth/login (with returnUrl) when no valid session', () => {
      configure(expiredJwt(), expiredJwt());
      const result = run(authGuard) as any;
      expect(result.__urlTree).toEqual(['/auth/login']);
      expect(createUrlTree).toHaveBeenCalledWith(['/auth/login'], {
        queryParams: { returnUrl: '/groups/123' },
      });
    });

    it('redirects when there are no tokens at all', () => {
      configure(null, null);
      expect((run(authGuard) as any).__urlTree).toEqual(['/auth/login']);
    });
  });

  describe('guestGuard', () => {
    it('redirects an authenticated user to /dashboard', () => {
      configure(validJwt(), null);
      expect((run(guestGuard) as any).__urlTree).toEqual(['/dashboard']);
    });

    it('redirects to /dashboard when access is expired but refresh is valid', () => {
      configure(expiredJwt(), validJwt());
      expect((run(guestGuard) as any).__urlTree).toEqual(['/dashboard']);
    });

    it('allows an unauthenticated user to see the login screen', () => {
      configure(null, null);
      expect(run(guestGuard)).toBe(true);
    });
  });
});
