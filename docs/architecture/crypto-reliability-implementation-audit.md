# Crypto Reliability Implementation Audit

Status: Implementation planning audit — **corrected 2026-07-26** to match the accepted hybrid encryption scope (see `crypto-reliability-final-spec.md` §1). An earlier revision of this document assumed a "full financial payload E2E encryption" scope decision that has since been rejected; sections that depended on that assumption are struck through/corrected below rather than silently rewritten, so the reasoning trail stays visible.

Date: 2026-07-26.

Parent spec: [`crypto-reliability-final-spec.md`](crypto-reliability-final-spec.md).

Purpose: identify the current implementation gaps between FinMate's codebase and the accepted crypto **reliability** architecture (session lifecycle, recovery, race conditions — not encryption scope), then define the next implementation sequence. This is not implementation code.

## Executive Summary

FinMate uses hybrid encryption: expense titles/descriptions are encrypted client-side; amounts, currency, category, dates, splits, settlement amounts, settlement currencies, balance math, analytics, carry-forward, and dashboard totals are plaintext/server-computed. **This is correct, accepted, shipped behavior — not a gap.** The reliability spec changes session lifecycle, recovery, and ciphertext-versioning behavior around that existing scope; it does not require migrating amounts/splits/balances to ciphertext or moving aggregate computation to the client. Sections 1, 2, 3, 8, and Phases 2–5/7 below were written under the rejected full-payload assumption and are corrected accordingly.

The strongest existing foundations are versioned group keys, per-member wrapped group keys, in-memory group-key caching, de-duped group-key resolution, and title/description decryption classification. The reliability gaps actually worth closing are `CryptoSessionManager`/`ensureCryptoContext()` (now implemented — see Phase 1 status), session epoch cancellation, bounded recovery state, BroadcastChannel coordination, and the master-key persistence policy mismatch (§6 below). There is no plaintext-amount/split migration to do.

## Confirmed Current-State Findings

### 1. Expense rows expose structured financial content as plaintext — **by design, not a gap**

Evidence:

- `shared/data-models/src/lib/expense.entity.ts` stores `title`, `description`, `amount_total`, `currency`, `category`, and `expenseDate` as direct columns.
- `backend/src/app/expenses/dto/create-expense.dto.ts` validates plaintext `amountTotal`, `currency`, `category`, `expenseDate`, and `splits`.
- `shared/data-models/src/lib/dto/expense.dto.ts` exposes the same plaintext fields to shared client/server contracts.
- `backend/src/app/expenses/expenses.service.ts` writes `dto.amountTotal`, `dto.currency`, and `dto.category` directly to `Expense`, and serializes them back in responses.

~~Required migration: introduce a full encrypted expense payload envelope...~~ **No migration required.** This is exactly the accepted hybrid model (`crypto-reliability-final-spec.md` §1): `title`/`description` are ciphertext (correct, already implemented); `amount_total`/`currency`/`category`/`expenseDate`/splits are intentionally plaintext so the server can compute ledger math. No entity/DTO change follows from the reliability spec.

### 2. Expense splits are authoritative plaintext ledger rows — **by design, not a gap**

Evidence:

- `shared/data-models/src/lib/expense-split.entity.ts` stores `splitType`, `shareValue`, `amount_owed`, settlement flags, and participant references directly.
- `backend/src/app/expenses/expenses.service.ts` calls `calculateDeterministicSplits(dto.amountTotal, dto.splits)` and persists calculated `amountOwed` rows.
- `backend/src/app/settlements/settlements.service.ts` reads `ExpenseSplit.amountOwed` to compute balances and suggested settlements.

~~Required migration: move split math to the client crypto pipeline...~~ **No migration required.** Server-side split/balance computation from plaintext `ExpenseSplit` rows is the accepted design; moving it client-side was the rejected proposal.

### 3. Backend analytics, dashboard, carry-forward, and settlement math depend on plaintext — **by design, not a gap**

Evidence:

- `backend/src/app/expenses/expenses.service.ts` implements monthly summary, yearly summary, category distribution, combined monthly analytics, `listMyExpenses`, carry-forward summary, and `closeMonth` using `amountTotal`, `amountOwed`, `currency`, and `category`.
- `backend/src/app/settlements/settlements.service.ts` computes group balances, suggested settlements, and friends balances from plaintext expenses, splits, and settlements.
- `frontend/src/app/features/groups/services/expenses.service.ts` calls backend analytics endpoints and reduces plaintext amounts returned by `/expenses/analytics/all-monthly`.

~~Required migration: move aggregate computation to frontend/domain code...~~ **No migration required.** Server-computed analytics/carry-forward/settlements are correct as shipped and verified this session (`docs/EXPENSE_MODULE_FREEZE.md`, `docs/releases/BETA_1.0.md`). No client-side ledger calculator is planned.

### 4. Frontend encrypts only title/description today — **correct scope, not a gap**

Evidence:

- `frontend/src/app/features/groups/services/expenses.service.ts` `encryptPayload()` resolves master/group key and encrypts only `payload.title` and `payload.description`.
- `frontend/src/app/core/services/expense-decryption.service.ts` decrypts only `title` and `description`, preserving `encryptedTitle` and `encryptedDescription`.
- `frontend/src/app/core/services/encryption.service.ts` has `encryptExpense()` and `decryptExpense()` wrappers limited to title/description.

~~Required migration: replace field-by-field encryption with full-payload envelope encryption...~~ **No migration required for scope.** Encrypting only title/description (plus notes/attachments elsewhere) is correct per §1. What's optionally still worth doing: `ClientEncryptionService.encryptEnvelope()`/`decryptEnvelope()` (added — see `encryption.service.ts`) is a reusable, version-stamped, AAD-authenticated primitive that title/description _could_ migrate onto instead of the current plain `iv:ciphertext` format, for the write/read race-condition closures in §4 of the final spec. That migration is optional, lower-risk (same fields, better-authenticated format) and unrelated to the rejected full-payload proposal — not yet started.

### 5. CryptoSessionManager — **done, partially wired**

Evidence at the time of the original audit: no `CryptoSessionManager`, `ensureCryptoContext`, `sessionEpoch`, `RecoveringBlocked`, or BroadcastChannel session state implementation existed; callers invoked `ClientEncryptionService.loadKeyFromSession()` and `GroupKeyService` directly.

Current state: `CryptoSessionManager` exists and owns session lifecycle, bounded recovery, epoch cancellation, and BroadcastChannel session events (see Phase 1 below). `auth.state.ts`, `expenses.service.ts`, and `expense-decryption.service.ts` route through it. `CryptoBootstrapService` (asymmetric-key bootstrap after login/refresh) is unchanged and still separate — it isn't a session lifecycle concern in the same sense and doesn't need to move.

Remaining: recurring-expense service, group-detail key actions (`initializeGroupKeysAndSelfHeal`, `refreshGroupKey`), and the join-group flow (`JoinGroupComponent.onJoin()`) still call `GroupKeyService`/`ClientEncryptionService` directly rather than through `CryptoSessionManager`. Migrating them isn't required for correctness — they already work — but would centralize epoch cancellation/recovery classification for those paths too.

### 6. Master key persistence currently conflicts with the final policy

Evidence:

- `frontend/src/app/core/services/encryption.service.ts` `deriveAndStoreKey()` derives the master key and stores it in `ZkKeyVaultService`.
- `loadKeyFromSession()` loads the master key from IndexedDB if memory is empty, allowing refresh survival without re-authentication.
- The accepted spec says Master Key / UDK is active-session memory only and never persisted unwrapped.

Required migration:

- Stop persisting the unwrapped/non-extractable master `CryptoKey` in IndexedDB.
- Retain only derivation metadata and wrapped private/recovery material at rest.
- Refresh should enter `NoSession` or `Loading` and require a valid unlock/recovery ceremony unless a platform-authenticated, explicitly approved wrapped-session-key design is added later.
- `ZkKeyVaultService` should be audited and narrowed to wrapped blobs/private wrapping key storage only.

### 7. Group-key service partially matches the spec but needs session integration

Evidence:

- `GroupKeyService` already stores group keys in memory only and clears legacy IndexedDB key material through `clearPersistentCache()`.
- It already de-dupes `resolveGroupKey()` calls with `activeGroupKeyRequests`.
- It already tracks active key version ids and has `getGroupKeyForEncryption()` for write paths.
- It does not own cancellation epochs, BroadcastChannel rotation handling, write grace retry, or recovery escalation.

Required migration:

- Keep `GroupKeyService` focused on version resolution/provisioning/storage.
- Add `purpose: 'read' | 'write'` semantics to `ensureGroupKey()` or an equivalent wrapper from `CryptoSessionManager`.
- Connect group-key resolution to session epoch cancellation and recovery classification.
- Add BroadcastChannel invalidation/update handling through `CryptoSessionManager`, not ad hoc component logic.

### 8. Settlement records are plaintext financial content — **by design, not a gap**

Evidence:

- `shared/data-models/src/lib/settlement.entity.ts` stores `amount`, `currency`, `status`, `settledOn`, and `note` directly.
- `backend/src/app/settlements/settlements.service.ts` writes and snapshots plaintext settlement amount/currency/note and includes amount/currency in audit metadata.
- `ClientEncryptionService.encryptSettlement()` encrypts `note` (sensitive/freeform), leaves `amount`/`currency` plaintext (structured financial data).

~~Required migration: settlement amount/currency must become encrypted...~~ **No migration required.** This is correct per §1 — `note` is the only sensitive field on a settlement; amount/currency are structured financial data the server needs to compute against. `Settlement.note` lacking `@IsCiphertext` validation is a real, separate, already-tracked gap (`docs/audits/expense-audit.md` EXP-008, `docs/releases/BETA_BACKLOG.md`), unrelated to this spec.

### 9. Historical documentation — **was correct; this audit's original claim was wrong**

Evidence:

- `docs/frozen-decisions.md` says amounts remain plaintext and backend aggregation is intentional.
- `docs/EXPENSE_MODULE_STATUS.md` says title/description ciphertext only and amounts/dates/categories are plaintext.
- `docs/file-map.md` describes the expense row as ciphertext title/description plus plaintext amount/currency/category/date.
- `docs/group-key-flow.md` says zero-knowledge encryption for sensitive expense fields (not full financial payloads).

These documents accurately describe the accepted, shipped architecture. The original version of this audit called them conflicting with "the accepted spec" — that was backwards; the full-payload proposal was the outlier, and it has been rejected (`crypto-reliability-final-spec.md` §1). No doc updates are needed here as a result of the reliability spec.

## Proposed Implementation Phases

The original Phase 0 (compatibility guardrails for a plaintext→ciphertext migration) and Phases 3, 4, 5, 7 (encrypted payload columns, client-side ledger calculators, settlement encryption, legacy data migration) depended entirely on the rejected full-payload proposal and are removed. What remains is the actual reliability work — session lifecycle, ciphertext versioning for the fields that are already encrypted, and storage/recovery hardening — none of which touches the data model.

### Phase 1 - CryptoSessionManager Foundation — **done**

Goal: implement the agreed lifecycle boundary without changing the data model.

- `CryptoSessionManager` with states `NoSession`, `Loading`, `Ready`, `Recovering`, `RecoveringBlocked`, `Fatal` — implemented (`frontend/src/app/core/services/crypto-session-manager.service.ts`).
- `ensureCryptoContext()` as the app-facing session entry point — implemented, wired into `auth.state.ts`, `expenses.service.ts`, `expense-decryption.service.ts`.
- Session epoch cancellation — implemented (`assertCurrentEpoch`, checked around resolve/decrypt calls).
- Bounded recovery counters (two silent attempts, third → `RecoveringBlocked`; a real tamper/integrity signal → `Fatal`, not yet wired since no such signal exists yet — see Phase 2 note below) — implemented.
- BroadcastChannel session-end/recovery-blocked sync — implemented.
- Not yet done: routing recurring-expense service, group-detail key actions, and the join-group flow through `CryptoSessionManager` (they still call `GroupKeyService`/`ClientEncryptionService` directly).

### Phase 2 - Envelope Crypto Primitive — **done, optional to wire anywhere**

Goal (revised): provide a reusable, version-stamped, AAD-authenticated ciphertext primitive for the write/read race-condition closures in the final spec §4 — not a full-payload migration.

- `EncryptedEnvelope` contract added to `shared/data-models` (`groupId`/`keyVersion`/`keyId`/`schemaVersion`/`algorithm`).
- `ClientEncryptionService.encryptEnvelope()`/`decryptEnvelope()` implemented, with metadata as AES-GCM additional authenticated data (tamper-evident) and a distinct `EnvelopeMetadataMismatchError` for caller-side version/group checks.
- Nothing currently uses it. Migrating title/description from the plain `iv:ciphertext` format onto this envelope is optional future work — same encrypted fields, better-authenticated ciphertext-versioning — and should be scoped as its own small change if pursued, not bundled with anything data-model-related.

### Phase 3 (was Phase 6) - Storage, Recovery, and Multi-Tab Hardening — **not started**

Goal: close the remaining reliability races from the final spec §4.

Tasks:

- Remove unwrapped master key persistence from IndexedDB (§2 of the final spec; audit finding §6 above).
- Add IndexedDB journal states for crypto metadata writes: `pending -> committed`.
- Add a startup recovery scan before entering `Ready`.
- Wire logout cancellation to reject stale crypto results and prevent cache repopulation (partially covered by `CryptoSessionManager.beginLogout()`'s epoch bump — verify no caller still repopulates `GroupKeyService`'s cache with a result captured under a stale epoch).
- Add idempotent recovery promises keyed by `{sessionEpoch, recoveryReason}` (`handleRecoverableFailure`'s in-flight map already does this; the recovery step itself — `runIdempotentRecovery` — is currently a bookkeeping stub for every failure class except `no_master_key`, i.e. it tracks attempts but doesn't retry anything yet for group-key failures).
- Add BroadcastChannel tests for session end, key rotation, stale event ignore, and recovery re-entry (session-end/recovery-blocked have coverage; key-rotation/wrapped-key-update event types are declared in the final spec's Multi-Tab Events list but not yet implemented in `CryptoSessionManager`).

## High-Risk Decisions Still Needing Product Sign-Off

- Whether `GroupKeyService`'s group-key-rotation/wrapped-key-update BroadcastChannel events (declared in the final spec, not yet implemented) are worth building now, given key rotation still has no UI entry point (`docs/KNOWN_ISSUES.md` KI-1).
- Whether removing unwrapped master-key IndexedDB persistence (Phase 3) should ship before or after a platform-bound wrapped-session-key alternative exists — removing it outright means every refresh requires re-entering the password, a real UX regression from today's behavior.

## Suggested Next Implementation Slice

Phase 3 (storage/recovery/multi-tab hardening) is the only remaining item from this audit. It's a real, scoped reliability improvement, independent of encryption scope — start with the master-key IndexedDB removal only if the UX tradeoff above is explicitly accepted; otherwise start with the IndexedDB write-journal and BroadcastChannel key-rotation event work, which have no user-facing tradeoff.
