import { jwtDecode } from 'jwt-decode';

/**
 * Whether a JWT is present and not expired.
 *
 * `skewSeconds` treats a token expiring within the skew window as already
 * invalid, so we proactively refresh rather than fire a request that is about
 * to 401.
 */
export function isTokenValid(
  token: string | null | undefined,
  skewSeconds = 10,
): boolean {
  if (!token) return false;
  try {
    const { exp } = jwtDecode<{ exp?: number }>(token);
    if (!exp) return false;
    return exp * 1000 > Date.now() + skewSeconds * 1000;
  } catch {
    return false;
  }
}

/**
 * A session is "active enough" to enter a protected route when the access
 * token is still valid, OR the access token has expired but a valid refresh
 * token can silently renew it (the HTTP interceptor performs the refresh).
 */
export function hasActiveSession(
  accessToken: string | null | undefined,
  refreshToken: string | null | undefined,
): boolean {
  return isTokenValid(accessToken) || isTokenValid(refreshToken);
}

/** Safely decode a JWT payload; returns null on absent/corrupt tokens. */
export function decodeToken<T>(token: string | null | undefined): T | null {
  if (!token) return null;
  try {
    return jwtDecode<T>(token);
  } catch {
    return null;
  }
}
