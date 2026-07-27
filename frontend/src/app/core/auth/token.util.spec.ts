import { isTokenValid, hasActiveSession, decodeToken } from './token.util';

/** Build an unsigned JWT whose payload has the given `exp` (seconds since epoch). */
function jwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.sig`;
}
const inSeconds = (s: number) => Math.floor(Date.now() / 1000) + s;

describe('token.util', () => {
  describe('isTokenValid', () => {
    it('is false for null/empty/garbage', () => {
      expect(isTokenValid(null)).toBe(false);
      expect(isTokenValid('')).toBe(false);
      expect(isTokenValid('not-a-jwt')).toBe(false);
    });

    it('is false for a token with no exp', () => {
      expect(isTokenValid(jwt({ sub: 'x' }))).toBe(false);
    });

    it('is true for a token expiring comfortably in the future', () => {
      expect(isTokenValid(jwt({ exp: inSeconds(600) }))).toBe(true);
    });

    it('is false for an expired token', () => {
      expect(isTokenValid(jwt({ exp: inSeconds(-1) }))).toBe(false);
    });

    it('treats a token expiring within the skew window as invalid', () => {
      // exp is 5s away; default skew is 10s -> considered invalid (refresh early)
      expect(isTokenValid(jwt({ exp: inSeconds(5) }))).toBe(false);
      expect(isTokenValid(jwt({ exp: inSeconds(5) }), 0)).toBe(true);
    });
  });

  describe('hasActiveSession', () => {
    const valid = jwt({ exp: inSeconds(600) });
    const expired = jwt({ exp: inSeconds(-1) });

    it('true when the access token is valid', () => {
      expect(hasActiveSession(valid, null)).toBe(true);
    });
    it('true when access is expired but refresh is valid', () => {
      expect(hasActiveSession(expired, valid)).toBe(true);
    });
    it('false when both are expired/absent', () => {
      expect(hasActiveSession(expired, expired)).toBe(false);
      expect(hasActiveSession(null, null)).toBe(false);
    });
  });

  describe('decodeToken', () => {
    it('returns payload for a valid token and null otherwise', () => {
      expect(decodeToken<{ sub: string }>(jwt({ sub: 'abc' }))?.sub).toBe('abc');
      expect(decodeToken('garbage')).toBeNull();
      expect(decodeToken(null)).toBeNull();
    });
  });
});
