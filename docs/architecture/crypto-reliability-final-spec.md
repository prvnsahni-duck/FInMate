# Crypto Reliability Final Spec

Status: Accepted for implementation.

Date: 2026-07-26.

Scope: FinMate collaborative expense encryption, group-key reliability, recovery behavior, multi-tab consistency, and lost-key recovery policy.

This document resolves the remaining crypto reliability architecture open items: session lifecycle, recovery, race conditions, and lost-key policy. It does **not** change encryption scope — FinMate's hybrid model (freeform/sensitive fields encrypted end-to-end; structured financial data plaintext for server-side computation) remains as-is and is restated in §1 below. An earlier revision of this document proposed encrypting amounts/balances/splits end-to-end and moving all aggregate computation client-side; that proposal is rejected and superseded by the hybrid decision in §1.

## Baseline

- UI code never handles crypto directly. UI flows call application services that invoke `ensureCryptoContext()`.
- The expense crypto pipeline is `ExpenseService -> GroupKeyService.ensureGroupKey() -> CryptoService`.
- `CryptoSessionManager` owns session lifecycle, recovery orchestration, retries, state transitions, telemetry, cancellation, and multi-tab synchronization.
- `CryptoService` contains pure cryptographic primitives only.
- `GroupKeyService` owns group-key storage, version resolution, provisioning, and rotation metadata only.
- Key hierarchy is `password/passkey/recovery material -> Master Key -> Private Key -> Group Keys -> per-record encrypted data`.
- Draft expense data is persisted outside the crypto pipeline and is cleared only after a durable encrypted write acknowledgement.
- Concurrent `ensureGroupKey()` calls are de-duped through a shared in-flight promise.
- Multi-tab session and key events are synchronized through `BroadcastChannel`.

## 1. E2E Encryption Scope

Decision: FinMate uses **hybrid** end-to-end encryption. Sensitive, user-authored content — titles, descriptions, notes, and attachments — is encrypted end-to-end and never readable by the server. Structured financial data required for ledger computation — amounts, currencies, splits, balances, settlements, member IDs, and related metadata — remains plaintext so the server can perform calculations, synchronization, and reporting efficiently.

This is the existing, shipped model (`docs/EXPENSE_MODULE_STATUS.md`, `docs/frozen-decisions.md`) and is retained deliberately, not as an interim step toward full-payload encryption. Encrypting amounts/splits/balances end-to-end would require the server to stop computing `simplifyLedgerDebts`, carry-forward, settlements, and all analytics — moving that entire surface to client-side computation — for a privacy gain (hiding numeric amounts, not their existence or the fact that a shared expense occurred) that was assessed as not worth that cost and the accompanying migration risk to already-shipped, tested ledger logic.

Explicit tradeoff, accepted: the server can read amounts, currencies, splits, balances, and settlement values. Titles, descriptions, notes, and attachment content cannot be read by the server under any circumstance.

## 2. CryptoKey Persistence Policy

Decision: Master keys and unwrapped private keys are memory-only after unlock; group keys may be persisted only as wrapped key blobs; no unwrapped private, master, or group key is ever persisted locally or remotely.

The unlock ceremony derives or unwraps the Master Key locally. The Master Key exists only as a non-extractable browser `CryptoKey` in the active session. The user's private wrapping key is stored only encrypted/wrapped at rest and is unwrapped into memory after unlock. Group keys are cached unwrapped only in memory for the active session. Wrapped group keys may be persisted in IndexedDB and on the backend when they are wrapped for a specific authorized user/device. In-memory key material is cleared on logout, session expiry, crypto reset, fatal crypto state, or session epoch cancellation.

| Key type                            | In memory                         | Persisted locally                                           | Persisted remotely                                          |
| ----------------------------------- | --------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| Password/passkey secret             | Only during unlock ceremony       | Never                                                       | Never                                                       |
| Master Key / UDK                    | Active crypto session only        | Never unwrapped; derivation salt and verifier metadata only | Never unwrapped                                             |
| Private wrapping key                | Active crypto session only        | Wrapped only                                                | Wrapped only, if needed for authorized multi-device restore |
| Public wrapping key                 | Yes                               | Plain allowed                                               | Plain allowed                                               |
| Group keys                          | Active crypto session cache only  | Wrapped only                                                | Wrapped per authorized member/device only                   |
| Per-record data keys, if introduced | Short-lived operation memory only | Wrapped only or embedded encrypted                          | Wrapped only or embedded encrypted                          |

## 3. Recovery Escalation Policy

Decision: Allow two silent recovery attempts per crypto fault scope, then escalate the next repeated recoverable failure to user-visible `RecoveringBlocked`; integrity, authenticity, key-lineage, and downgrade failures escalate immediately to `Fatal`.

Silent recovery is limited to transient or locally repairable cases: stale in-memory session state, recoverable IndexedDB errors, tab handoff races, missing in-memory keys when wrapped keys are available, and recoverable BroadcastChannel ordering issues. `CryptoSessionManager` tracks attempts by `{userId, groupId?, operationType, failureClass, keyVersion?, sessionEpoch}` in a rolling window. The first and second attempts may run silently. A third failure in the same scope requires user action such as re-authentication, reload, or support flow. Authentication tag failure, signature mismatch, unwrap authentication failure, ciphertext tampering, impossible key-version downgrade, revoked-key use, or unexpected key lineage bypasses retry and becomes fatal immediately.

## 4. Race Conditions To Close

Decision: Close known races with version-stamped ciphertext, transactional local persistence, cancellation-aware session epochs, and idempotent recovery epochs.

### Key-Version-On-Write Ordering

Every encrypted record must authenticate the following associated data:

- `groupId`
- `recordId`
- `keyId`
- `groupKeyVersionId`
- `recordSchemaVersion`
- `algorithm`
- `creatorUserId`
- `creatorDeviceId`, when available

`ensureGroupKey(groupId, "write")` returns a concrete write-authorized `groupKeyVersionId`. If a `BroadcastChannel` rotation event arrives while encryption is already in flight, the write may finish with the version it acquired. The server accepts that write only while the old version remains inside the configured write grace window. If the version is stale, the server rejects with a stale-key-version error and the client re-resolves the latest write key, re-encrypts, and retries under the original idempotency key. Reads always resolve by the ciphertext's stamped key version, not by the group's current active version.

### IndexedDB Write Tearing On Tab Close

Draft writes and crypto metadata writes must use atomic IndexedDB transactions with a small journal state: `pending -> committed`. On startup, `CryptoSessionManager` scans pending crypto metadata writes and either completes or rolls them back before entering `Ready`. Draft data remains outside the crypto pipeline and is saved before crypto begins, so user input can be restored even when a tab closes during encryption or key persistence.

### Logout Mid-Operation Cancellation

`CryptoSessionManager` owns a monotonic session epoch and cancellation token. Every `ensureCryptoContext()`, `ensureGroupKey()`, encrypt, decrypt, unwrap, recovery, and provisioning operation captures the current epoch. Logout increments the epoch, cancels outstanding operations, clears in-memory keys, and broadcasts `crypto-session-ended`. A stale operation that completes under an old epoch must discard its result and reject with a cancellation/session-ended error. No stale result may repopulate caches after logout.

### Refresh-During-Recovering Re-Entrancy

Recovery is idempotent and guarded by one in-flight recovery promise keyed by `{sessionEpoch, recoveryReason}`. On refresh, the new runtime reads persisted recovery metadata, checks whether recovery is still needed, and either resumes the same step or marks it obsolete if the session is already valid. State transitions use compare-and-swap semantics:

```text
Loading -> Recovering(epoch, attempt)
Recovering(epoch, attempt) -> Ready
Recovering(epoch, attempt) -> NoSession
Recovering(epoch, attempt) -> RecoveringBlocked
Recovering(epoch, attempt) -> Fatal
```

No nested recovery may start for the same epoch and reason.

## 5. Lost-Device / Lost-All-Keys Recovery

Decision: Accept permanent data loss when all authorized devices and all user-controlled recovery material are lost. Do not introduce server-decryptable escrow in v1.

FinMate's E2E trust model requires that the server cannot recover user financial content without a user-controlled secret or an already-authorized device. Supported recovery paths are trusted-device onboarding, passkey/password re-authentication, and optional user-owned recovery material such as a high-entropy recovery code or exported encrypted backup. If recovery codes are added, they must be generated client-side, shown once, and used only to unwrap the user's Master Key or private wrapping key. Server-side decryptable escrow is out of scope because it would weaken the E2E guarantee.

## Final Architecture

```text
User unlock
  password/passkey/user-owned recovery material
        |
        v
CryptoSessionManager
  - session state machine
  - unlock and recovery orchestration
  - retry and escalation policy
  - cancellation epoch
  - BroadcastChannel sync
  - telemetry without plaintext or key material
        |
        v
Master Key / UDK, memory-only
        |
        +--> unwrap Private Key, memory-only
        |
        +--> unwrap Group Keys from wrapped local/remote blobs
                  |
                  v
ExpenseService
  calls ensureCryptoContext()
        |
        v
GroupKeyService.ensureGroupKey(groupId, purpose, version?)
  - de-dupes concurrent calls
  - resolves concrete key versions
  - stores wrapped group keys only
  - owns provisioning and rotation metadata
        |
        v
CryptoService
  - encrypt/decrypt/sign/verify/wrap/unwrap primitives only
  - no lifecycle, retry, storage, or recovery policy
        |
        v
Expense/settlement records
  title, description, notes, attachment content: ciphertext,
    authenticating group id, record id, key id, group key version,
    schema version, and algorithm
  amount, currency, splits, balances, settlement values,
    member ids: plaintext, server-computed
```

## State Machine

```text
NoSession
  -> Loading
  -> Ready
  -> Recovering
  -> RecoveringBlocked
  -> Fatal

Ready
  -> Recovering on recoverable transient crypto/session fault
  -> NoSession on logout or session expiry
  -> Fatal on integrity, authenticity, key-lineage, or downgrade failure

Recovering
  -> Ready when idempotent recovery succeeds
  -> RecoveringBlocked after two failed silent attempts for the same scope
  -> Fatal on tamper/integrity/key-lineage failure
  -> NoSession on logout
```

## Write Path

1. UI saves draft data outside the crypto pipeline.
2. `ExpenseService` calls `ensureCryptoContext()`.
3. `ExpenseService` calls `GroupKeyService.ensureGroupKey(groupId, "write")`.
4. `GroupKeyService` returns a concrete write-authorized group key and version.
5. `CryptoService` encrypts only the record's sensitive/freeform fields (title, description, notes, attachment content) client-side. Amount, currency, splits, and other structured financial fields are sent plaintext.
6. Ciphertext is stamped with `groupKeyVersionId` and authenticated metadata.
7. The backend stores the ciphertext fields plus the plaintext structured/financial fields and sync metadata; it computes/persists split amounts, balances, and settlement math from the plaintext fields as it does today.
8. If the backend rejects a stale key version, the client re-resolves, re-encrypts, and retries under the same idempotency key.
9. Draft data clears only after durable write acknowledgement.

## Read Path

1. Client receives records: ciphertext for sensitive/freeform fields, plaintext for structured financial fields.
2. The record's `groupKeyVersionId` determines which wrapped group key is needed to decrypt the sensitive fields.
3. `GroupKeyService` resolves and unwraps that exact version.
4. `CryptoService` decrypts the sensitive fields locally, for display.
5. Balances, totals, and settlement suggestions are computed server-side, as today, and returned directly — no client-side ledger computation is required or planned.

## Multi-Tab Events

```text
crypto-session-ready(epoch)
crypto-session-ended(epoch)
group-key-rotated(groupId, newVersion, rotationId)
wrapped-key-updated(groupId, version)
recovery-started(epoch, reason)
recovery-completed(epoch)
recovery-blocked(epoch, reasonClass)
```

Receivers compare event epoch, key version, and rotation id before mutating local state. Stale events are ignored.

## Implementation-Ready Invariants

- Plaintext title/description/notes/attachment content never reaches the backend. Amounts, currencies, splits, balances, settlement values, and member ids are intentionally plaintext server-side and are out of scope for this invariant.
- No unwrapped Master Key, private key, group key, or per-record key is persisted.
- Ciphertext (sensitive/freeform fields) is always version-stamped and decrypts through the stamped version.
- Reads are backward-compatible across group key rotations.
- Writes tolerate rotation races through grace-window acceptance or stale-version retry.
- Recovery is bounded, classified, idempotent, and visible after repeated failure.
- Logout invalidates all in-flight crypto results through session epoch cancellation.
- Draft data survives crypto failure and tab close.

## Risks Accepted

- The server can read amounts, currencies, splits, balances, and settlement values by design (§1). Only titles, descriptions, notes, and attachment content are protected from server access.
- Losing all authorized devices and all user-owned recovery material makes titles/descriptions/notes/attachment content unrecoverable (structured financial data is unaffected, since it isn't encrypted).
- Users may occasionally see recovery-blocked prompts after repeated transient failures.
- Key rotation implementation must support version-aware read/write semantics and stale-write retry, for the fields that are encrypted.
