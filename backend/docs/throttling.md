# Throttling Architecture

This document describes the request rate-limiting (throttling) architecture used in FinMate's backend.

---

## Overview

FinMate uses [`@nestjs/throttler`](https://github.com/nestjs/throttler) v6 with a custom profile isolation system built on top of the framework's native `skipIf` extension point.

Each throttle profile has its own rate limit and TTL, and is isolated so that only explicitly opted-in routes execute a given profile. Undecorated routes default to the `default` profile.

---

## Profiles

| Profile          | Limit | TTL    | Env Override              | Purpose                        |
| ---------------- | ----- | ------ | ------------------------- | ------------------------------ |
| `default`        | 100   | 60 sec | `THROTTLE_LIMIT_DEFAULT`  | Normal authenticated API calls |
| `login`          | 5     | 60 sec | `THROTTLE_LIMIT_LOGIN`    | Login endpoint                 |
| `register`       | 5     | 60 sec | `THROTTLE_LIMIT_REGISTER` | Registration endpoint          |
| `forgotPassword` | 3     | 60 sec | `THROTTLE_LIMIT_FORGOT`   | Forgot password (reserved)     |
| `resetPassword`  | 3     | 60 sec | `THROTTLE_LIMIT_RESET`    | Reset password (reserved)      |
| `otp`            | 5     | 60 sec | `THROTTLE_LIMIT_OTP`      | 2FA verification/disable       |
| `refresh`        | 15    | 60 sec | `THROTTLE_LIMIT_REFRESH`  | Token refresh                  |
| `import`         | 10    | 60 sec | `THROTTLE_LIMIT_IMPORT`   | Data import                    |
| `export`         | 20    | 60 sec | `THROTTLE_LIMIT_EXPORT`   | Data export                    |

Profile names are centralized in `backend/src/app/throttler/throttle.constants.ts` as the `THROTTLE_PROFILES` constant.

---

## Architecture

```
Request
  │
  ▼
ConditionalThrottleGuard          ← Bypasses all throttling in E2E/test
  │
  ▼
NestJS ThrottlerGuard.canActivate ← Framework loop over all profiles
  │
  ├─ For each profile:
  │   skipIf(ctx) → ThrottlePolicyResolver.resolvePolicy(ctx)
  │                 └─ Reads FINMATE:THROTTLE_POLICY metadata
  │                 └─ Returns profile name or 'default'
  │                 └─ skipIf returns true if profile ≠ resolved policy
  │   ↓ (if not skipped)
  │   UserThrottlerGuard.handleRequest
  │     └─ generateKey (user-ID-based)
  │     └─ Redis increment
  │     └─ Populate req.throttleContext
  │
  ▼
Controller
```

### Key Components

| Component                  | File                                     | Responsibility                                   |
| -------------------------- | ---------------------------------------- | ------------------------------------------------ |
| `THROTTLE_PROFILES`        | `throttler/throttle.constants.ts`        | Centralized profile name constants               |
| `@ThrottleAs()`            | `throttler/throttle-policy.decorator.ts` | Single public decorator for assigning profiles   |
| `ThrottlePolicyResolver`   | `throttler/throttle-policy.resolver.ts`  | Reads our own metadata to resolve active profile |
| `ThrottlerConfigModule`    | `throttler/throttler-config.module.ts`   | Global module exporting the resolver             |
| `UserThrottlerGuard`       | `guards/user-throttler.guard.ts`         | User-ID-based key generation + throttleContext   |
| `ConditionalThrottleGuard` | `guards/conditional-throttle.guard.ts`   | E2E/test bypass                                  |
| `ThrottlerRedisStorage`    | `throttler/throttler-redis.storage.ts`   | Redis-backed counter storage                     |

---

## How to Use

### For a new endpoint that should use the default profile

Do nothing. Undecorated routes automatically use the `default` profile (100 req/min).

### For a new endpoint with a specific profile

```typescript
import { ThrottleAs } from '../throttler/throttle-policy.decorator';
import { THROTTLE_PROFILES } from '../throttler/throttle.constants';

@Post('forgot-password')
@ThrottleAs(THROTTLE_PROFILES.FORGOT_PASSWORD)
async forgotPassword(@Body() dto: ForgotPasswordDto) {
  // ...
}
```

### For a new throttle profile

Follow this checklist:

1. **Add to `THROTTLE_PROFILES`** in `backend/src/app/throttler/throttle.constants.ts`

2. **Add a throttler entry** in `backend/src/app/app.module.ts`:

   ```typescript
   {
     name: THROTTLE_PROFILES.NEW_PROFILE,
     ttl: 60000,
     limit: getLimit('THROTTLE_LIMIT_NEW_PROFILE', 10),
     skipIf: skipUnlessPolicy(THROTTLE_PROFILES.NEW_PROFILE),
   },
   ```

3. **Apply `@ThrottleAs()`** to the route(s) that should use this profile

4. **Add tests** in:
   - `throttle-policy.resolver.spec.ts` — resolver returns correct profile
   - `throttler-integration.spec.ts` — profile isolation verified

---

## Request Context

The guard populates `req.throttleContext` with rate-limit metadata for downstream consumers:

```typescript
req.throttleContext = {
  userId: string;        // Authenticated user ID or 'anonymous'
  profile: string;       // Active throttle profile name
  limit: number;         // Maximum requests allowed
  remaining: number;     // Requests remaining in window
  retryAfter: number;    // Seconds until unblocked (0 if not blocked)
  blockedUntil: number;  // Epoch ms when block expires (0 if not blocked)
  throttleKey: string;   // The throttle key used for this request
};
```

This context is used by:

- **`HttpExceptionFilter`** — to format 429 responses with user-friendly messages and headers
- **`LoggingInterceptor`** — to log the authenticated user ID consistently

---

## Error Response Format (HTTP 429)

```json
{
  "success": false,
  "message": "Too many requests. Please wait a few seconds and try again.",
  "errorCode": "CON_LIMIT_RATE",
  "statusCode": 429,
  "retryable": true,
  "retryAfter": 60
}
```

Response headers:

- `Retry-After: 60`
- `X-RateLimit-Limit: 100`
- `X-RateLimit-Remaining: 0`

---

## Key Generation

Rate limits are tracked per user, not per IP. The `UserThrottlerGuard` extracts the user ID from:

1. `req.user.id` (if JwtAuthGuard has already run)
2. JWT bearer token payload (manual parse fallback)
3. Falls back to IP address for anonymous requests

---

## Testing

Run all throttler tests:

```bash
npx nx test backend --testPathPattern="throttl"
```

Test coverage:

- **`throttle-policy.resolver.spec.ts`** — Unit tests for profile resolution
- **`user-throttler.guard.spec.ts`** — Guard key generation and throttleContext
- **`throttler-integration.spec.ts`** — End-to-end profile isolation with counter verification
