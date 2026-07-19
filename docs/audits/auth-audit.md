# Authentication Audit — 2026-07-16

## Summary

The FinMate auth stack (NestJS backend + Angular frontend) implements most documented controls faithfully: the dual-token JWT lifetimes, the Redis session-store key derivation (`refresh_token:${userId}:${sha256(refreshId)}` → Argon2 hash of `refreshId`), token rotation on refresh, revocation on logout, AES-256-GCM encryption of TOTP secrets, Argon2 password hashing, and the full route-specific rate-limit matrix all match the sources of truth with enforcing code.

However, two documented guarantees are **not met**:

1. **Refresh tokens are NOT delivered as HTTP-only, secure cookies** (ARCHITECTURE.md §2.4/line 203). They are returned in the JSON body and stored in browser `localStorage`, and the refresh endpoint reads them from the request body. There is zero cookie code in the backend. (Note: this actually matches API_SPECIFICATION.md, so the two docs conflict — but the ARCHITECTURE guarantee is violated.)
2. **The documented "password change = re-wrap UDK" flow does not exist** (ARCHITECTURE.md line 77-78 / Spec line 488-489). There is no change-password, forgot-password, or reset-password endpoint anywhere in the backend or frontend, so the UDK re-wrap cannot happen.

Additional weaknesses: a hardcoded default `ENCRYPTION_KEY` fallback, HS256 not explicitly pinned (relies on library default), CORS `CORS_ORIGINS` replaces rather than augments `FRONTEND_URL`, env-driven global throttle bypass flags, and unconditional Swagger exposure + `trust proxy`.

## Findings table

| #   | Documented guarantee                                                                       | Status | Evidence (file:line)                                                                                                                                                                                            | Gap                                                                                                                                   | Priority |
| --- | ------------------------------------------------------------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1a  | Access token 15 min                                                                        | ✅     | backend/src/app/auth/auth.service.ts:348-355 (`expiresIn: '15m'`)                                                                                                                                               | —                                                                                                                                     | —        |
| 1b  | Refresh token 7 days                                                                       | ✅     | auth.service.ts:358-365 (`expiresIn: '7d'`)                                                                                                                                                                     | —                                                                                                                                     | —        |
| 1c  | HS256 signing, key validated at startup                                                    | ⚠     | Key validation: auth.service.ts:38-46; jwt.strategy.ts:17 `getOrThrow`. HS256 not pinned                                                                                                                        | Algorithm relies on jsonwebtoken/passport-jwt default; no explicit `algorithm: 'HS256'` on sign nor `algorithms: ['HS256']` on verify | Medium   |
| 1d  | Refresh token in HTTP-only, secure cookie                                                  | ❌     | Returned in body auth.service.ts:162-166; read from body auth.controller.ts:61-62; frontend stores in localStorage jwt.interceptor.ts:12,31 & auth.service.ts(FE):32-41. No cookie code in backend (grep: none) | Guarantee violated; tokens exposed to JS/XSS. Conflicts with API_SPECIFICATION.md:253,271 which document body transport               | High     |
| 2   | Redis key `refresh_token:${userId}:${sha256(refreshId)}`, value = Argon2 hash of refreshId | ✅     | auth.service.ts:141-147 (login), 283-285 (refresh verify), 311-315 (rotation). `createHash('sha256')` + `argon2.hash(refreshId)`                                                                                | —                                                                                                                                     | —        |
| 3   | Token rotation on refresh; revocation on logout; expiry                                    | ✅     | Rotation: del old auth.service.ts:297 + set new :315; logout revoke :339-344; 7-day TTL :146-147                                                                                                                | —                                                                                                                                     | —        |
| 4   | 2FA/TOTP secrets AES-256-GCM in Postgres                                                   | ✅     | encryption.service.ts:30,54 (`aes-256-gcm`); secret encrypted enable2Fa auth.service.ts:171, decrypted :124-125,202,239                                                                                         | Depends on ENCRYPTION_KEY (see #10a)                                                                                                  | —        |
| 5   | Password hashing (Argon2)                                                                  | ✅     | users.service.ts:34 `argon2.hash(passwordPlain)`; verify auth.service.ts:107                                                                                                                                    | Uses argon2 library default params (Argon2id); no explicit memory/time cost tuning                                                    | Low      |
| 6a  | Rate limits match documented numbers                                                       | ✅     | app.module.ts:72-121 — default 100, login 5, register 5, forgot 3, reset 3, otp 5, refresh 15, import 10, export 20; applied via `@ThrottleAs` auth.controller.ts:29,40,60,93,115                               | forgot/reset profiles configured but unused (no endpoints)                                                                            | —        |
| 6b  | RATE_LIMIT_ENABLED validated at boot                                                       | ✅     | env.validation.ts:4-38 (normalize+validate); enforced conditional-throttle.guard.ts:29-32                                                                                                                       | —                                                                                                                                     | —        |
| 7a  | Helmet security headers global                                                             | ✅     | main.ts:14-25                                                                                                                                                                                                   | CSP `scriptSrc` allows `'unsafe-inline'` (for Swagger) — weakens XSS protection                                                       | Low      |
| 7b  | CORS origin validation (FRONTEND_URL + CORS_ORIGINS)                                       | ⚠     | main.ts:28-34                                                                                                                                                                                                   | When `CORS_ORIGINS` is set it **replaces** rather than augments `FRONTEND_URL` (ternary, not merge); FRONTEND_URL silently dropped    | Medium   |
| 8   | Password change re-wraps UDK without re-encrypting data                                    | ❌     | No change/forgot/reset-password route exists (auth.controller.ts routes: register/login/refresh/logout/2fa only; grep across backend+frontend: none). Only saveKeys users.controller.ts:82                      | Entire documented flow (ARCHITECTURE.md:77-78) unimplemented; no re-wrap code path                                                    | High     |
| 9   | Auth audit logging (login events, ipHash SHA-256)                                          | ✅     | ipHash: auth.service.ts:49-51 (`createHash('sha256')`); login_success :153-160; mfa events :175,216,254                                                                                                         | Only login **success** logged; failed logins not audited (auth.service.ts:100-113 throw without writeAuditLog)                        | Low      |
| 10  | No undocumented endpoints / dev backdoors / weaker fallbacks                               | ⚠/❌  | See "Undocumented behavior"                                                                                                                                                                                     | Default encryption key, throttle bypass flags, Swagger exposure, trust proxy                                                          | High     |

## Detailed findings for each ⚠/❌

### 1c — HS256 not explicitly pinned (⚠ Medium)

TRD.md:71 states "Tokens are signed using HS256 with key validation verified at startup." Key validation is enforced (auth.service.ts:38-46 throws if `JWT_SECRET`/`JWT_REFRESH_SECRET` missing; jwt.strategy.ts:17 uses `getOrThrow`). But `generateAccessToken`/`generateRefreshToken` (auth.service.ts:348-365) never pass an `algorithm`, and `jwtService.verifyAsync` (:268) / passport-jwt (jwt.strategy.ts:14-19) never restrict `algorithms`. It works only because the library default is HS256. Recommend pinning `algorithm: 'HS256'` on sign and `algorithms: ['HS256']` on all verifies to defend against algorithm-substitution.

### 1d — Refresh token transport violates ARCHITECTURE guarantee (❌ High)

ARCHITECTURE.md:203 explicitly promises "HTTP-only, secure `refresh_tokens`." Reality:

- Login returns `{ accessToken, refreshToken, user }` in JSON (auth.service.ts:162-166).
- The refresh endpoint accepts the token from the request body `RefreshTokenDto` (auth.controller.ts:61-62), not from a cookie.
- The frontend stores both tokens in `localStorage` (`finmate_token`, `finmate_refresh_token`) — jwt.interceptor.ts:12,31.
- `grep` for `cookie`/`httpOnly`/`res.cookie` across `backend/src` returns nothing.

Consequence: refresh tokens are readable by any JavaScript (XSS-exfiltratable) and are not `Secure`/`SameSite`-protected. Note the documentation is internally inconsistent — API_SPECIFICATION.md:253,271,280 documents the body-based transport that the code actually implements. Resolve by either implementing HTTP-only secure cookies (to honor ARCHITECTURE.md) or correcting ARCHITECTURE.md; the stated security guarantee is currently unmet.

### 7b — CORS_ORIGINS replaces FRONTEND_URL (⚠ Medium)

main.ts:28-30: `process.env.CORS_ORIGINS ? split(...) : [FRONTEND_URL || 'http://localhost:4200']`. ARCHITECTURE.md implies both should be honored ("FRONTEND_URL + CORS_ORIGINS"). As written, once `CORS_ORIGINS` is configured the primary `FRONTEND_URL` origin is dropped unless manually re-listed, risking accidental lockout or (if operators compensate loosely) over-broad origins. Merge the two sources.

### 8 — Password-change / UDK re-wrap flow absent (❌ High)

ARCHITECTURE.md:77-78 and Spec:488-489 guarantee that changing the password re-wraps the UDK without re-encrypting data. No implementation exists: no `change-password`, `forgot-password`, or `reset-password` controller route (auth.controller.ts has only register/login/refresh/logout/2fa); no service method performs UDK re-wrap; `users.service.saveKeys` (:154-166) only overwrites wrapping keys with no auth/old-password check and no rotation semantics. The `forgotPassword`/`resetPassword` throttle profiles (throttle.constants.ts:17-18, app.module.ts:88-98) are configured but wired to nothing — dead config confirming the flow was scoped but never built. Users currently cannot change or recover passwords at all.

### 9 — Failed-login events not audited (⚠ Low)

Audit logging is correct for success paths with SHA-256 ipHash (auth.service.ts:49-51,153-160). However invalid-credential and inactive-account paths (:100-113) throw without writing an audit entry, so brute-force/credential-stuffing attempts leave no audit trail. Consider logging `auth.login_failure`.

## Undocumented behavior found

- **10a — Hardcoded default encryption key (High).** encryption.service.ts:18-19 falls back to `'default_encryption_key_for_finmate_development_phase'` when `ENCRYPTION_KEY` is unset. This key encrypts 2FA/TOTP secrets and profile PII (avatar) via AES-256-GCM. ARCHITECTURE.md:406 marks `ENCRYPTION_KEY` as required, but the code silently degrades to a publicly-known static key instead of failing closed (contrast with the JWT secrets, which throw). Should `getOrThrow` at boot.

- **10b — Environment-driven global throttle bypass (Medium).** app.module.ts:49-56 and conditional-throttle.guard.ts:14-25 disable all rate limiting when any of `THROTTLE_SKIP=true`, `NODE_ENV`/`APP_ENV` in {test,e2e}, `E2E=true`, `PLAYWRIGHT_*`, or NX e2e task markers are present; `RATE_LIMIT_ENABLED=false` also disables it entirely (conditional-throttle.guard.ts:29). These flags are not documented in ARCHITECTURE.md and, if leaked into a production environment, silently remove all abuse protection.

- **10c — Swagger UI exposed unconditionally (Medium).** main.ts:60-68 mounts Swagger at `/docs` in every environment with no auth/env guard, exposing the full API surface in production.

- **10d — `trust proxy` enabled unconditionally (Medium).** main.ts:40 sets `trust proxy` to `true` always, and the login handler derives client IP from the client-controllable `x-forwarded-for` header (auth.controller.ts:44-47). When not actually behind a trusted proxy, an attacker can spoof `X-Forwarded-For` to poison the per-IP rate-limit key and the audit `ipHash`.

- **10e — `saveKeys` overwrites wrapping keys without re-auth (Low/Medium).** users.controller.ts:82 / users.service.ts:154-166 lets an authenticated session replace `publicWrappingKey`/`encryptedPrivateWrappingKey` with no old-password or step-up check — an undocumented endpoint that interacts with the (missing) password-change design.

- **10f — TOTP verification uses non-constant-time string comparison (Low).** totp.util.ts:68 compares codes with `===`; minor timing side-channel, and the shared `verifyTotp` window is ±1 step (:62,67).

- **10g — Profile decrypt silently falls back to ciphertext (Low).** users.service.ts:127-135 swallows decryption failures and returns the raw stored value, which can mask key/format errors.
