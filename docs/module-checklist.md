# Module Implementation Checklist

Per-module state derived from the 2026-07-16 audits. `☑` = implemented & compliant · `⚠` = partial/drift (see gap-tracker) · `☐` = not implemented.
Check boxes as gap-tracker items close.

## Expense

- ☑ Entity · ☑ DTO (`@IsCiphertext`) · ☑ Client encryption · ☑ Splits + server sum validation
- ☑ Ledger month + carry-forward · ☑ Optimistic lock (expense) · ☑ Soft delete (expense)
- ⚠ Key-version on update (EXP-003) · ⚠ Split soft-delete (EXP-004) · ⚠ Split version (EXP-005)
- ⚠ Settled-edit adjustments (EXP-001) · ⚠ Recurring currency check (EXP-007) · ⚠ Recurring key-version (EXP-002)
- ☐ Projection (N/A — derived) · ☐ Search (roadmap)

## Encryption / Key Management

- ☑ UDK/master key derivation · ☑ Group key gen/wrap/unwrap · ☑ Version state machine · ☑ Per-member wrapped keys
- ☑ Rotation · ☑ Version-keyed cache · ☑ Failure classification + retry
- ⚠ versionId serving (ENC-002) · ⚠ Fail-closed on ENCRYPTION_KEY (ENC-001) · ⚠ Avatar scope doc (ENC-003)

## Groups

- ☑ Entities · ☑ Membership · ☑ Invites (wrapped key + expiry) · ☑ Archive · ☑ Currency lock · ☑ Contributions · ☑ Owner-cannot-leave
- ⚠ Role-change authz (GRP-001, Critical) · ⚠ Spectator enforcement (GRP-003) · ⚠ Invite revoke (GRP-004)
- ⚠ Audit coverage (GRP-002) · ⚠ Leaver key revocation (GRP-005) · ☐ trip type (roadmap)

## Authentication

- ☑ Dual JWT · ☑ Redis sessions · ☑ Rotation/revoke · ☑ 2FA (AES-GCM) · ☑ Argon2 · ☑ Rate limits · ☑ Helmet
- ⚠ Refresh cookie transport (AUTH-001) · ⚠ HS256 pin (AUTH-003) · ⚠ CORS merge (AUTH-004) · ⚠ Proxy/Swagger hardening (AUTH-005)
- ☐ Password change/reset/verify (AUTH-002)

## Personal Finance

- ☑ Personal expense encryption · ☑ Dashboard aggregation (no duplicates)
- ☐ Goals CRUD + encryption (PF-002) · ☐ Notes CRUD · ☐ User deletion (PF-001)

## Sync / Offline

- ☑ Optimistic-lock reconciliation · ☑ Key cache persistence
- ☐ Service worker/PWA (SYNC-001) · ☐ Offline queue (SYNC-002) · ☐ Ledger cache

## Attachments

- ☑ Entity (polymorphic) · ☑ Client envelope encryption (expense path) · ☑ DB cascade
- ⚠ Legacy plaintext path (ATT-002) · ☐ Real storage backend (ATT-001) · ☐ Upload/download endpoints · ☐ Size/type limits · ☐ OCR (roadmap)

## Search & Projection

- ☑ ZK-safe aggregation (plaintext columns only) · ☑ No plaintext leak
- ⚠ Cursor/sort key (SRCH-001) · ☐ Blind index (roadmap) · ☐ Redis aggregation cache (SRCH-002)

## Notifications & Email

- ☑ Invite email (Resend) · ☑ No ZK leak in emails
- ⚠ Email endpoint throttle (NOTIF-001) · ☐ Verify/reset emails (NOTIF-002) · ☐ In-app notifications (NOTIF-004) · ☐ WebSocket push (NOTIF-003) · ☐ Push/BullMQ (roadmap)

## AI

- ☑ Proxy endpoint · ☑ UUID redaction · ☑ No persistence
- ⚠ Server-side opt-in (AI-001, Critical) · ⚠ ZDR/prompt-injection guards (AI-002) · ⚠ Dedicated rate limit (AI-003) · ☐ OCR (roadmap)
