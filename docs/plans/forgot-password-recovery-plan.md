# Forgot-Password + Account Recovery — Implementation Plan

Date: 2026-08-08
Status: Awaiting approval (no source changes yet)

## Goal

Add a zero-knowledge forgot-password flow that **preserves the user's encrypted
data** by unwrapping their private wrapping key with a user-held **recovery
code**, re-wrapping it under a newly chosen password. Delivered over email via
the existing `EmailService.sendPasswordResetEmail` (Resend). When a user has no
recovery code, reset is **blocked with guidance** (no silent data loss).

## Key model (why a recovery code is required)

```
password + email --PBKDF2--> masterKey --AES-GCM--> privateKeyJWK --> group keys --> data
encryptedPrivateWrappingKey = encrypt(privateKeyJWK, masterKey)   // stored
```

A forgotten password means `masterKey` is unrecoverable. The recoverable secret
is `privateKeyJWK`. We store a second wrap of it under the recovery code:

```
recoveryKey        = deriveMasterKey(recoveryCode, email)      // reuses existing PBKDF2
recoveryWrappedKey = encrypt(privateKeyJWK, recoveryKey)       // stored server-side (ciphertext)
```

All crypto reuses `ClientEncryptionService` primitives (`deriveMasterKey`,
`encrypt`, `decrypt`). No new crypto libraries, no new algorithms.

## Scope: three parts

### Part A — Recovery-code setup (prerequisite)

Populates `recoveryWrappedKey`; without it Part C has nothing to unwrap.

- **Frontend**
  - `group-key.service.ts`: `generateRecoveryBlob(recoveryCode)` — loads
    privateKeyJWK (decrypt existing `encryptedPrivateWrappingKey` with session
    master key), derives `recoveryKey`, returns `encrypt(privateKeyJWK, recoveryKey)`.
  - New util `recovery-code.util.ts`: `generateRecoveryCode()` — 20 random bytes
    via `crypto.getRandomValues`, Crockford base32, grouped `XXXXX-XXXXX-XXXXX-XXXXX`.
  - New component `recovery-setup` (rendered inside dashboard-profile security
    section): generate → show code once → confirm saved → `authService.setRecoveryKey(blob)`.
    Reads `getRecoveryKeyStatus()` to show configured/last-set state; supports regenerate.
  - `auth.service.ts` (frontend): `setRecoveryKey`/`getRecoveryKeyStatus` already exist — reuse.
- **Backend**: `POST /users/me/recovery-key` + status endpoint already exist — reuse.

### Part B — Forgot request

- **Backend**
  - `auth.dto.ts`: `ForgotPasswordDto { email }`.
  - `auth.controller.ts`: `POST /auth/forgot-password` — `@ThrottleAs(FORGOT_PASSWORD)`,
    always returns generic `SuccessResponse` (no email enumeration).
  - `auth.service.ts`: `requestPasswordReset(email)` — look up user; if found,
    `token = randomUUID()`, `redis.set('pwd_reset:'+token, userId, 3600)`,
    build `${FRONTEND_URL}/auth/reset-password?token=`, call
    `emailService.sendPasswordResetEmail(email, url)`. Best-effort; never leaks existence.
- **Frontend**
  - `forgot-password` lazy page + route: email field → `authService.requestPasswordReset(email)`
    → always show "if an account exists, a link was sent".

### Part C — Reset (data-preserving)

- **Backend**
  - `GET /auth/reset-password?token=` — validate token (peek, no consume),
    return `{ email, hasRecoveryKey, recoveryWrappedKey | null }`.
  - `auth.dto.ts`: `ResetPasswordDto { token, newPassword (MinLength 8),
encryptedPrivateWrappingKey }`.
  - `POST /auth/reset-password` — `@ThrottleAs(RESET_PASSWORD)`:
    `resetPassword(dto)` → `redis.getDel('pwd_reset:'+token)` (atomic single-use);
    invalid/expired → `AUTH_RESET_INVALID` BadRequest; set
    `passwordHash = argon2.hash(newPassword)`, set `encryptedPrivateWrappingKey`,
    `revokeAllSessions(userId)`, audit `auth.password_reset`.
- **Frontend**
  - `reset-password` lazy page + route reading `?token=`:
    1. `GET` reset context. If `!hasRecoveryKey` → blocked-guidance screen (no form).
    2. Form: recovery code + new password (+ confirm).
    3. `recoveryKey = deriveMasterKey(recoveryCode, email)`; `privateKeyJWK =
decrypt(recoveryWrappedKey, recoveryKey)` — wrong code → AEAD failure →
       "recovery code didn't match" error.
    4. `newMasterKey = deriveAndStoreKey(newPassword, email)`;
       `newBlob = encrypt(privateKeyJWK, newMasterKey)`.
    5. `POST /auth/reset-password { token, newPassword, encryptedPrivateWrappingKey: newBlob }`.
    6. On success → redirect to login. `recoveryWrappedKey` is unchanged (same
       code, same privateKeyJWK) so the user keeps their existing recovery code.
  - `auth.service.ts` (frontend): `requestPasswordReset`, `getResetContext(token)`,
    `resetPassword(payload)`.
  - Add "Forgot password?" link on the login page.

## Notes / decisions

- **No email enumeration**: forgot always returns success; reset context for an
  invalid token returns a generic invalid state.
- **No data-wipe path** (per decision): no-recovery-code users are blocked with guidance.
- **Sessions**: reset revokes all refresh tokens; user logs in fresh.
- **recoveryWrappedKey** is not modified on reset (unchanged secret + code).
- **Throttle**: reuse existing reserved `FORGOT_PASSWORD` / `RESET_PASSWORD` profiles.

## Tests

- Backend `auth.service.spec.ts`: reset happy path (hash swap + blob stored +
  sessions revoked + audit), invalid/expired token, forgot for unknown email
  stays generic. Controller wiring where present.
- Frontend: recovery round-trip (setup blob → reset unwrap yields same
  privateKeyJWK), wrong-code rejection, blocked-when-no-recovery-key.
- `EmailService` unchanged (already tested).

## Files (estimate)

Backend: `auth.dto.ts`, `auth.controller.ts`, `auth.service.ts`, `auth.service.spec.ts`, `.env.example` (doc only).
Frontend: `auth.service.ts`, `group-key.service.ts`, `recovery-code.util.ts`, `forgot-password/*`, `reset-password/*`, `recovery-setup/*`, `app.routes.ts`, login page link, specs.
Docs: progress log in `FinMate_Project_Specification.md`.

## Out of scope

- Passkey/PIN recovery providers, SMS reset, admin-initiated reset, server-side key escrow.
