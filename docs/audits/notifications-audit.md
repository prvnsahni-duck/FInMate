# Notifications & Email Audit — 2026-07-16

## Summary

FinMate's "Notifications & Email" surface is **minimally implemented and largely aspirational** relative to the docs. The only working email path is a **group-invite email** sent via the Resend HTTP API (`backend/src/app/email/email.service.ts`), triggered from group creation and member invitation. Two other email templates (email verification, password reset) exist as **dead code** — defined but never called, with no controller routes and no callers.

There is **no in-app notification system** (no entity, no endpoints, no UI), **no push notifications** (Capacitor project has only `cli`/`core`, no push plugin), **no WebSocket/real-time push** (TRD promises Socket.io — absent), and **no BullMQ email queue** (TRD promises it — absent). Frontend "notifications" amount to a single 429 rate-limit banner plus native `alert()` calls; there is no toast service or persistent notification center.

On the zero-knowledge front: invite emails do **not** leak ZK-protected content. They include only the group `name` and inviter `displayName`, both of which are stored **plaintext** at rest (`shared/data-models/src/lib/group.entity.ts:17-18`) and are not ZK-protected fields. Encrypted expense titles/descriptions never appear in any email payload. (Minor privacy note: group names and inviter names are transmitted to a third-party provider, Resend.)

Rate limiting is well-built for auth (`login`/`register`/`otp`/`refresh` all decorated), but the **email-sending invite endpoints have no throttle at all**, and the configured `forgotPassword`/`resetPassword` throttle profiles are dead (no routes use them).

## Findings table

| # | Documented guarantee | Status | Evidence (file:line) | Gap | Priority |
|---|---|---|---|---|---|
| 1 | EmailModule exists in module graph | ✅ | `ARCHITECTURE.md:237`; `backend/src/app/email/email.module.ts:1-8`; `backend/src/app/app.module.ts:168` | None | — |
| 2 | Email provider integration | ✅ (Resend via raw axios) | `email.service.ts:12-13,27-41` | Uses direct HTTP call, not Resend SDK; silently falls back to console mock if `RESEND_API_KEY` unset (`:17-21,48-56`) | Low |
| 3 | Group invite emails (PRD viral growth; multi-identifier invites) | ✅ | `email.service.ts:59-81`; triggered `groups.service.ts:232`, `groups.service.ts:623` | Fire-and-forget `.catch()` only logs; no delivery tracking/retry | Low |
| 4 | Email verification / OTP-at-registration email | ❌ Dead code | `email.service.ts:83-100` (`sendVerificationEmail` never called — grep shows only definition); no `verify-email` route in `auth.controller.ts` | Template exists but no trigger, no route, no token flow | Medium |
| 5 | Password reset email | ❌ Dead code | `email.service.ts:102-120` (`sendPasswordResetEmail` never called); no forgot/reset route in `auth.controller.ts` (`:28-128`) | Template + throttle profiles configured but no endpoints/callers | Medium |
| 6 | In-app / persistent notifications (entity, endpoints, UI) | ❌ Not implemented | No `*notif*` dir/file anywhere (repo-wide find empty); DB has no notification entity (`shared/data-models/src/lib/`) | Entirely absent | Medium |
| 7 | Push notifications (Capacitor) | ❌ Not implemented | `capacitor.config.ts:1-9` (no plugins); `package.json` has only `@capacitor/cli`,`@capacitor/core`, no `@capacitor/push-notifications`/FCM | No push at all | Low (roadmap) |
| 8 | Real-time push / sync alerts via WebSockets (Socket.io) | ❌ Not implemented | `TRD.md:36` promises Socket.io; no `@WebSocketGateway`/socket.io in `backend/src` (only `GatewayTimeoutException` in `ai.service.ts:4`) | No WebSocket layer | Medium |
| 9 | BullMQ (Redis) queue for async email notifications | ❌ Not implemented | `TRD.md:31`; no `bullmq`/`BullModule`/`@nestjs/bull` in `backend/src` or `package.json` | Emails sent inline, not queued | Low |
| 10 | Expense reminder notifications | 📋 Roadmap-only | `FinMate_Project_Specification.md:948` under "Future Enhancements" (`:941`) | Correctly scoped as future; not a broken promise | — |
| 11 | Auth rate limiting: Login/Register/OTP 5/min, Forgot/Reset 3/min, Refresh 15/min | ⚠ Partial | Configured `app.module.ts:75-110`; applied `auth.controller.ts:29,40,60,93,115` | Forgot/Reset profiles (`app.module.ts:88-97`) applied to **no route** — dead config | Low |
| 12 | Rate limiting/abuse protection on email-sending endpoints | ❌ Missing | Invite email routes `members.controller.ts:29` (`@Post()`) and `groups.controller.ts:39,122` have **no `@ThrottleAs`** | Invite/email-send endpoints unthrottled → email-spam / enumeration abuse vector | High |
| 13 | Emails must not leak ZK-protected content | ✅ | Invite payload uses only `groupName`+`inviterName` (`email.service.ts:65-70`), both plaintext at rest (`group.entity.ts:17-18`); expense title/description encrypted (`expense.entity.ts:25-28,76-82`) and never emailed | No ZK leak (minor: group/inviter names sent to Resend) | Low |

## Detailed findings for each ⚠/❌

### #4 & #5 — Verification and password-reset emails are dead code (❌)
`sendVerificationEmail` (`email.service.ts:83-100`) and `sendPasswordResetEmail` (`email.service.ts:102-120`) are fully authored HTML templates but are **never invoked** anywhere in `backend/src` (repo-wide grep returns only their definitions). Correspondingly:
- `auth.controller.ts` (`:28-128`) exposes `register`, `login`, `refresh`, `logout`, and `2fa/*` only — there is **no** `forgot-password`, `reset-password`, or `verify-email` route.
- The `FORGOT_PASSWORD` and `RESET_PASSWORD` throttle profiles (`app.module.ts:88-97`, `throttle.constants.ts:17-18`) are registered but bound to no handler.

Impact: The docs/PRD imply account verification and password recovery, but neither flow is reachable. Users cannot reset a forgotten password.

### #6 — No in-app notification system (❌)
Repo-wide search for any `notif`-named directory or file returns nothing. `shared/data-models/src/lib/` contains user, group, expense, settlement, attachment, note, goal, audit-log, invite, and key entities — but **no notification entity**. There is no notifications controller/service and no UI notification center. "Notifications" in the frontend are limited to: (a) a transient 429 rate-limit banner set from an HTTP-error `CustomEvent` (`error.interceptor.ts:39-40` → `main-layout.component.ts:107-115`, auto-cleared after 7s), and (b) native blocking `alert()` calls scattered across dashboard and group-detail components (e.g. `dashboard.component.ts:283,297,308,351`; `group-detail.component.ts:844,858,880,898`). No toast service exists.

### #8 — No WebSocket real-time push (❌)
`TRD.md:36` states "WebSockets (Socket.io) push notifications and sync alerts when shared ledgers are updated." No `@WebSocketGateway`, gateway module, or `socket.io` dependency exists in the backend. Shared-ledger updates rely on client polling/manual refresh, not server push.

### #9 — No BullMQ email queue (❌)
`TRD.md:31` promises "BullMQ (Redis-backed) manages … email notifications." No BullMQ/`@nestjs/bull` usage or dependency exists. Invite emails are sent inline (fire-and-forget) inside the request transaction path (`groups.service.ts:229-244`, `:622-632`), with failures only logged.

### #11 — Forgot/Reset throttle profiles are dead config (⚠)
`app.module.ts:88-97` configures 3/min limits for `forgotPassword`/`resetPassword` exactly as `ARCHITECTURE.md:210-211` promises, but since no route carries `@ThrottleAs(THROTTLE_PROFILES.FORGOT_PASSWORD/RESET_PASSWORD)`, the limits never engage. This is consistent with #5 (the endpoints don't exist yet).

### #12 — Email-sending endpoints lack rate limiting (❌, High)
The only live email trigger is group invitation. Its routes carry no throttle:
- `members.controller.ts:29` `@Post()` → `inviteMember` → `sendInviteEmail`
- `groups.controller.ts:39` `@Post()` create-group (sends invites for initial members, `groups.service.ts:232`)

Because `skipUnlessPolicy` skips throttling for any route without an explicit profile, these endpoints fall through to no effective per-route limit for email dispatch. An authenticated attacker can drive repeated invite emails to arbitrary addresses (email-bombing / user-enumeration via the `@placeholder.finmate` gating in `groups.service.ts:222-224,608-611`). Recommend a dedicated `INVITE`/email throttle profile applied to these handlers.

## Undocumented behavior found

1. **Console mock fallback for email** (`email.service.ts:17-21,48-56`): when `RESEND_API_KEY` is unset, all emails — including invite links — are silently logged to the server console instead of sent. Undocumented; a prod misconfiguration would fail open (no email, no error surfaced to the user).
2. **Placeholder-email suppression** (`groups.service.ts:222-224`, `:608-611`): invite emails are skipped for addresses ending in `@placeholder.finmate`. This dummy-email convention (used for username/phone-only invitees) is not described in the API/notification docs.
3. **Invite URL hash fragment carries `inviteKeyHash`** (`groups.service.ts:617-621`): the E2EE invite-key hash is appended to the emailed URL as a `#fragment` (sanitized to `[A-Za-z0-9_-]`). Fragments aren't sent to the server, so this is reasonable, but it means part of the key-provisioning secret travels through the email provider — undocumented in the notification contract.
4. **Provider choice is Resend via raw `axios`** (`email.service.ts:27-41`), not a mail SDK or SMTP; `FROM_EMAIL` defaults to `noreply@finmate.app`. Not documented in TRD/ARCHITECTURE (which only name an abstract `EmailModule`).
5. **Native `alert()` as the primary error-notification mechanism** across dashboard/group-detail components — an undocumented, non-accessible UX pattern that diverges from any implied toast/notification design.
6. **Capacitor is configured for a web-only shell** (`capacitor.config.ts`, `webDir: dist/frontend/browser`) with no native plugins, confirming mobile push is not merely unimplemented but unscaffolded.
