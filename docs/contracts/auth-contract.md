# Authentication Contract

Source: [auth/](../../backend/src/app/auth/) · Audit: [auth-audit.md](../audits/auth-audit.md)

## Responsibilities

- ✔ Register/login/logout; issue dual JWTs (access 15m, refresh 7d).
- ✔ Store refresh sessions in Redis: key `refresh_token:${userId}:${sha256(refreshId)}`, value = Argon2 hash of `refreshId`.
- ✔ Rotate refresh token on refresh; revoke on logout.
- ✔ Argon2 password hashing.
- ✔ 2FA/TOTP with AES-256-GCM-encrypted secrets.
- ✔ Route-specific rate limiting (login/register/otp 5, forgot/reset 3, refresh 15, default 100 per min).
- ✔ Helmet headers + CORS origin validation.
- ✔ Audit auth events with SHA-256 ipHash.

## Inputs

- Credentials, TOTP codes, refresh tokens, request IP/UA.

## Outputs

- Token pair + user; Redis session entries; audit rows.

## Public APIs

- `auth.controller.ts`: register, login, refresh, logout, 2fa/\*. (Password change/reset/verify — NOT yet implemented, see AUTH-002/NOTIF-002.)

## Dependencies

- Users, Redis, Email (for the missing reset/verify flows), Throttler.

## Must NEVER

- ❌ Store or log tokens/secrets in plaintext.
- ❌ Accept an unpinned JWT algorithm (pin HS256 — see AUTH-003).
- ❌ Overwrite user wrapping keys without re-auth (see AUTH-007).
- ❌ Trust `x-forwarded-for` outside a trusted proxy (see AUTH-005).
- ❌ Enforce a security gate only on the client.
