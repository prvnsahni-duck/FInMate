# Crypto Reliability Implementation Audit

Status: Implementation planning audit.

Date: 2026-07-26.

Parent spec: [`crypto-reliability-final-spec.md`](crypto-reliability-final-spec.md).

Purpose: identify the current implementation gaps between FinMate's codebase and the accepted crypto reliability architecture, then define the next implementation sequence. This is not implementation code.

## Executive Summary

The repository is still on the older hybrid encryption model. Expense titles/descriptions are encrypted client-side, but amounts, currency, category, dates, splits, settlement amounts, settlement currencies, balance math, analytics, carry-forward, and dashboard totals are plaintext/server-computed. The new accepted architecture requires full financial payload E2E encryption and client-side aggregate computation, so the migration is a schema/API/service boundary change, not only a frontend crypto wrapper change.

The strongest existing foundations are versioned group keys, per-member wrapped group keys, in-memory group-key caching, de-duped group-key resolution, and title/description decryption classification. The largest missing pieces are `CryptoSessionManager`, `ensureCryptoContext()`, encrypted full-payload DTO/entity contracts, client-side balance/settlement computation, bounded recovery state, session epoch cancellation, BroadcastChannel coordination, and migration away from plaintext amount/split columns as authoritative data.

## Confirmed Current-State Findings

### 1. Expense rows still expose financial content as plaintext

Evidence:

- `shared/data-models/src/lib/expense.entity.ts` stores `title`, `description`, `amount_total`, `currency`, `category`, and `expenseDate` as direct columns.
- `backend/src/app/expenses/dto/create-expense.dto.ts` validates plaintext `amountTotal`, `currency`, `category`, `expenseDate`, and `splits`.
- `shared/data-models/src/lib/dto/expense.dto.ts` exposes the same plaintext fields to shared client/server contracts.
- `backend/src/app/expenses/expenses.service.ts` writes `dto.amountTotal`, `dto.currency`, and `dto.category` directly to `Expense`, and serializes them back in responses.

Required migration:

- Introduce a full encrypted expense payload envelope. The encrypted payload must contain amount, currency, category, date where sensitive, split algorithm inputs, split computed shares, title, description, attachment metadata, and any other financial content.
- Retain only server-needed metadata in plaintext: ids, group id, owner/actor ids, payer/member identity references, status, ledger/sync cursors if accepted as metadata, timestamps, optimistic version, encryption scope, `groupKeyVersionId`, schema version, algorithm, and idempotency key.
- Treat existing plaintext financial columns as legacy/backfill-only during migration, then remove or de-authoritize them.

### 2. Expense splits are authoritative plaintext ledger rows

Evidence:

- `shared/data-models/src/lib/expense-split.entity.ts` stores `splitType`, `shareValue`, `amount_owed`, settlement flags, and participant references directly.
- `backend/src/app/expenses/expenses.service.ts` calls `calculateDeterministicSplits(dto.amountTotal, dto.splits)` and persists calculated `amountOwed` rows.
- `backend/src/app/settlements/settlements.service.ts` reads `ExpenseSplit.amountOwed` to compute balances and suggested settlements.

Required migration:

- Move split math to the client crypto pipeline. The client builds the full encrypted expense payload with split details and computed amounts.
- The server may retain participant membership references for access control and sync fan-out, but must not retain plaintext owed amounts/share values as authoritative financial data.
- If server-side participant validation remains, it should validate only identity/membership constraints, not financial totals.

### 3. Backend analytics, dashboard, carry-forward, and settlement math depend on plaintext

Evidence:

- `backend/src/app/expenses/expenses.service.ts` implements monthly summary, yearly summary, category distribution, combined monthly analytics, `listMyExpenses`, carry-forward summary, and `closeMonth` using `amountTotal`, `amountOwed`, `currency`, and `category`.
- `backend/src/app/settlements/settlements.service.ts` computes group balances, suggested settlements, and friends balances from plaintext expenses, splits, and settlements.
- `frontend/src/app/features/groups/services/expenses.service.ts` calls backend analytics endpoints and reduces plaintext amounts returned by `/expenses/analytics/all-monthly`.

Required migration:

- Move aggregate computation to frontend/domain code after decrypting records.
- Keep backend endpoints for encrypted record listing/sync only, or replace analytics endpoints with metadata-only stubs that clearly cannot return plaintext totals.
- Introduce a shared client-side ledger calculator for balances, suggested settlements, carry-forward projections, monthly totals, and category totals.
- Decide whether carry-forward remains a product feature in full E2E mode. If yes, carry-forward records must be generated client-side as normal encrypted expense/settlement records.

### 4. Frontend encrypts only title/description today

Evidence:

- `frontend/src/app/features/groups/services/expenses.service.ts` `encryptPayload()` resolves master/group key and encrypts only `payload.title` and `payload.description`.
- `frontend/src/app/core/services/expense-decryption.service.ts` decrypts only `title` and `description`, preserving `encryptedTitle` and `encryptedDescription`.
- `frontend/src/app/core/services/encryption.service.ts` has `encryptExpense()` and `decryptExpense()` wrappers limited to title/description.

Required migration:

- Replace field-by-field title/description encryption with full-payload envelope encryption.
- Decryption should return a typed decrypted domain object plus preserved ciphertext envelope for retry.
- Associated data must authenticate `groupId`, `recordId`, `keyId`, `groupKeyVersionId`, `recordSchemaVersion`, `algorithm`, `creatorUserId`, and `creatorDeviceId` where available.
- The existing `ExpenseDecryptionService` can evolve into envelope decryption, but retry/session orchestration must move to `CryptoSessionManager`.

### 5. CryptoSessionManager does not exist yet

Evidence:

- Search found no `CryptoSessionManager`, `ensureCryptoContext`, `sessionEpoch`, `RecoveringBlocked`, or BroadcastChannel session state implementation.
- Current callers invoke `ClientEncryptionService.loadKeyFromSession()` and `GroupKeyService` directly from services/components.
- `CryptoBootstrapService` bootstraps asymmetric keys after login/refresh, but it is not a session lifecycle state machine.

Required migration:

- Add `CryptoSessionManager` as the only owner of crypto session lifecycle.
- Add `ensureCryptoContext()` and route all application crypto entry points through it.
- Move recovery, bounded retry, session state, logout cancellation epoch, telemetry, and BroadcastChannel events into this manager.
- Gradually remove direct component/service calls to `loadKeyFromSession()` where they are performing lifecycle decisions.

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

### 8. Settlement records are plaintext financial content

Evidence:

- `shared/data-models/src/lib/settlement.entity.ts` stores `amount`, `currency`, `status`, `settledOn`, and `note` directly.
- `backend/src/app/settlements/settlements.service.ts` writes and snapshots plaintext settlement amount/currency/note and includes amount/currency in audit metadata.
- `ClientEncryptionService.encryptSettlement()` only encrypts `note`, not amount/currency.

Required migration:

- Settlement proposals/confirmations must become encrypted financial records or encrypted fields inside a settlement envelope.
- Server may retain status and participant references as metadata if product/security accepts that status leakage.
- Amount and currency must be client-encrypted and client-computed from decrypted balances.
- Audit logs must not store plaintext amount/currency/title metadata.

### 9. Historical documentation still conflicts with the accepted spec

Evidence:

- `docs/frozen-decisions.md` says amounts remain plaintext and backend aggregation is intentional.
- `docs/EXPENSE_MODULE_STATUS.md` says title/description ciphertext only and amounts/dates/categories are plaintext.
- `docs/file-map.md` describes the expense row as ciphertext title/description plus plaintext amount/currency/category/date.
- `docs/group-key-flow.md` still says zero-knowledge encryption for sensitive expense fields rather than full financial payloads.

Required migration:

- Do not rewrite all docs until implementation starts, but mark the conflict explicitly.
- During implementation PRs, update canonical docs alongside code changes.
- Treat `crypto-reliability-final-spec.md` as the accepted source of truth for new crypto work.

## Proposed Implementation Phases

### Phase 0 - Compatibility Guardrails

Goal: prevent more code from deepening the old plaintext model while migration proceeds.

Tasks:

- Add a short note to expense/settlement contracts pointing to the final crypto spec.
- Define an `EncryptedRecordEnvelope` TypeScript contract in shared models.
- Define what plaintext metadata remains allowed for expense and settlement records.
- Add tests that fail if new DTOs require plaintext `amountTotal`/`amountOwed` for encrypted group expenses after the migration flag is enabled.

### Phase 1 - CryptoSessionManager Foundation

Goal: implement the agreed lifecycle boundary without changing the data model yet.

Tasks:

- Create frontend `CryptoSessionManager` with states `NoSession`, `Loading`, `Ready`, `Recovering`, `RecoveringBlocked`, and `Fatal`.
- Implement `ensureCryptoContext()` as the only app-facing session entry point.
- Add session epoch cancellation and require crypto operations to capture/check epoch.
- Add bounded recovery counters: two silent attempts, third visible `RecoveringBlocked`; integrity failures go `Fatal`.
- Add BroadcastChannel event handling for session ready/end, key rotation, wrapped key update, recovery start/complete/block.
- Route `ExpensesService`, recurring expense service, group detail key actions, join group flow, and decrypt pipe away from direct lifecycle decisions.

### Phase 2 - Envelope Crypto Primitives

Goal: replace field-only encryption with authenticated full-payload encryption.

Tasks:

- Add envelope encrypt/decrypt helpers to `CryptoService`/client crypto primitives.
- Include algorithm, schema version, key id/version, and authenticated associated data.
- Extend `ExpenseDecryptionService` to decrypt full payloads and return typed decrypted expense objects.
- Preserve ciphertext envelope for retry just as title/description ciphertext is preserved today.
- Add tamper/integrity tests that verify AAD mismatch fails and escalates through `CryptoSessionManager`.

### Phase 3 - Expense Write/Read Contract Migration

Goal: make expenses store full encrypted financial payloads while keeping old columns temporarily readable for migration.

Tasks:

- Add encrypted payload columns/DTO fields for expense records.
- Make new client writes send encrypted payload plus allowed metadata only.
- Stamp every group expense ciphertext with `groupKeyVersionId` returned by write-key resolution.
- Add stale-key-version backend rejection and client retry/re-encrypt behavior.
- Keep legacy plaintext amount/split fields read-only or nullable during transition.
- Ensure draft data remains saved outside the crypto pipeline and clears only after encrypted write acknowledgement.

### Phase 4 - Client-Side Ledger Calculators

Goal: replace backend financial computation with decrypted client computation.

Tasks:

- Move deterministic split calculation into shared frontend-safe code or reuse `shared/utils` from the frontend build if appropriate.
- Build client ledger calculators for group balances, suggested settlements, monthly totals, category totals, carry-forward projections, and dashboard `myShare`.
- Update UI services/components to request encrypted records, decrypt locally, then compute views.
- Convert backend analytics endpoints to metadata/sync endpoints or deprecate them.

### Phase 5 - Settlement Encryption Migration

Goal: prevent settlement amounts/currencies/notes from being server-readable.

Tasks:

- Add encrypted settlement payload envelope.
- Move settlement proposal construction to the client after decrypted balance computation.
- Keep server-side participant/status/version validation only.
- Remove plaintext amount/currency from audit metadata and settlement snapshots.
- Add version-stamped settlement encryption with group key resolution.

### Phase 6 - Storage, Recovery, and Multi-Tab Hardening

Goal: close the reliability races from the final spec.

Tasks:

- Remove unwrapped master key persistence from IndexedDB.
- Add IndexedDB journal states for crypto metadata writes: `pending -> committed`.
- Add startup recovery scan before entering `Ready`.
- Wire logout cancellation to reject stale crypto results and prevent cache repopulation.
- Add idempotent recovery promises keyed by `{sessionEpoch, recoveryReason}`.
- Add BroadcastChannel tests for session end, key rotation, stale event ignore, and recovery re-entry.

### Phase 7 - Legacy Data Migration And Cleanup

Goal: complete the move away from plaintext financial columns.

Tasks:

- Define a migration story for existing plaintext records: client-side re-encryption on next access, explicit migration flow, or accepted dev reset if this is pre-production data.
- Remove or de-authorize plaintext amount/split/settlement columns as authoritative sources.
- Update `docs/frozen-decisions.md`, `docs/EXPENSE_MODULE_STATUS.md`, `docs/file-map.md`, `docs/group-key-flow.md`, contracts, OpenAPI, and tests to the final model.
- Add regression tests that assert backend responses do not expose plaintext financial content for group expenses/settlements.

## High-Risk Decisions Still Needing Product Sign-Off

These are implementation tradeoffs, not unresolved architecture choices:

- Whether `expenseDate`, `ledgerMonth`, and settlement `status` are allowed plaintext metadata. The final spec says currency metadata that reveals meaning must be encrypted; date/status leakage should be explicitly accepted or moved inside the encrypted payload.
- Whether carry-forward survives in full E2E mode. If retained, it becomes a client-generated encrypted workflow rather than a backend monthly close calculation.
- Whether existing development data can be reset, or whether a real legacy plaintext-to-encrypted migration flow is required.
- Whether refresh should always require unlock after removing persisted master keys, or whether a platform-bound wrapped session key is acceptable later.

## Suggested First Implementation Slice

Start with Phase 1 only: add `CryptoSessionManager`, `ensureCryptoContext()`, session epoch cancellation, bounded recovery states, and BroadcastChannel session events while preserving current field-level encryption behavior. This creates the reliability boundary first and reduces blast radius before changing the data model.

Acceptance criteria for the first slice:

- No component or feature service performs crypto session lifecycle decisions directly.
- Existing expense create/read/update flows still pass with title/description encryption.
- Logout during an in-flight encrypt/decrypt cannot repopulate key caches or commit stale results.
- Repeated recoverable session failure reaches `RecoveringBlocked` on the third failure.
- Integrity/decrypt authentication failure is classified as fatal, not silently retried.
