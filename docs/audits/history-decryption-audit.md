# History Decryption Architecture Audit

Date: 2026-07-25
Scope: design review only. No application code changes.
Source: `docs/audits/expense-architecture-audit.md`, finding P1-2 ("Group history decrypt bypasses the central expense decryption pipeline").

## Objective

Determine whether `GroupsService.getHistoryLogs`'s inline audit-metadata decryption should remain independent of the central expense decryption pipeline (`ExpenseDecryptionService` + `ExpenseDecryptCoordinator`), or be consolidated into it.

## Components Reviewed

- `frontend/src/app/core/services/expense-decryption.service.ts` — `ExpenseDecryptionService`
- `frontend/src/app/core/services/expense-decrypt-coordinator.service.ts` — `ExpenseDecryptCoordinator`
- `frontend/src/app/features/groups/services/groups.service.ts` — `GroupsService.getHistoryLogs`
- Supporting: `frontend/src/app/core/services/group-key.service.ts` (`GroupKeyService`), `frontend/src/app/core/models/decryption-state.ts`, `backend/.../audit-log.entity.ts`, `backend/.../expenses.service.ts` (audit-log write path)

## Current Architecture

### `ExpenseDecryptionService` (the central pipeline)

- Pure, idempotent, single-item and batch decryptor for `DecryptableExpense` (one `title` + one `description` ciphertext pair per row, plus `encryptionScope`/`groupId`/`groupKeyVersionId`/`wrappedContentKeys`).
- Key resolution is scope- and **version-aware**: for `scope === 'group'` it calls `GroupKeyService.resolveGroupKey(groupId, expense.groupKeyVersionId)` — the per-expense `groupKeyVersionId` (stamped on the expense row at write time) is passed through, so the correct historical key version is requested even if the group's active key has since rotated.
- Every failure (missing key, no access, rate-limited, no session, malformed ciphertext, wrong/rotated key, unexpected) is funneled through the single classifier `classifyDecryptionError`, producing a `{ state, category, message }` (`ExpenseDecryptionMeta`) that both the UI and the retry logic key off of.
- Does **no** retrying or key provisioning itself — it is called again from scratch each pass, which is safe because ciphertext is always preserved (`encryptedTitle`/`encryptedDescription`) so re-attempting needs no server round-trip.

### `ExpenseDecryptCoordinator` (retry/provisioning orchestration)

- Owns the full lifecycle for a *list* of `DecryptableExpense`s: `loading → recovering → settled`, via `phase`/`summary` signals a component binds to.
- On each retryable pass it also does **key recovery as a side effect**: loads the caller's asymmetric keys, resolves the group key, and — if the caller is `owner`/`admin` — mints a group key if none exists and provisions any member missing a wrapped copy (`checkAndProvisionMissingKeys`).
- Retry policy (`shouldRetry`/`retryDelayMs`, capped at `MAX_DECRYPTION_ATTEMPTS`) and session cancellation (`session` token, `stop()`) live only here.
- Designed for one primary, high-stakes, high-volume surface per group: the expense ledger.

### `GroupsService.getHistoryLogs` (history metadata decryption)

- One-shot: fetches `/groups/:id/history`, then for each audit log entry calls `groupKeyService.getGroupDataKey(groupId)` **without a version id** (always resolves the group's *current active* key), and decrypts up to three independent ciphertext fields per entry (`metadata.title`, `metadata.newTitle`, `metadata.previousTitle`) via `ClientEncryptionService.decrypt` directly.
- On missing key or decrypt failure, each field is individually replaced with the flat string constant `DECRYPTION_FAILED_PLACEHOLDER` ('Unable to display this item') and the failure is `console.warn`/`console.error`-logged — no `ExpenseDecryptionMeta`, no state/category, no UI-visible distinction between "waiting for keys" and "permanently inaccessible."
- Runs inside the `GroupsService.getHistoryLogs` RxJS `mergeMap` once per subscription; the calling component (`GroupDetailComponent.fetchHistoryLogs`) does not retry on error or re-invoke automatically — a log entry that failed to decrypt stays a placeholder until something re-triggers `fetchHistoryLogs` (e.g. switching tabs).

Note: `GroupsService.getDeletedExpenses`, in the same file, already routes through the central pipeline (`this.decryptor.decryptExpenses(res.data)`), showing the central pipeline is already reused elsewhere in this service where the data shape matches (`Expense[]`). History's metadata blob does not match that shape.

## Comparison

| Aspect | `ExpenseDecryptionService` / `ExpenseDecryptCoordinator` | `GroupsService.getHistoryLogs` |
| --- | --- | --- |
| **Responsibility** | Decrypt a `title`/`description` pair per expense; coordinator adds retry + provisioning for a live ledger view | Decrypt up to 3 independent ciphertext strings (`title`, `newTitle`, `previousTitle`) embedded in a free-form `metadata` blob, for a read-only audit trail |
| **Key resolution** | `GroupKeyService.resolveGroupKey(groupId, groupKeyVersionId)` — **version-aware**, using the per-expense stamped version | `GroupKeyService.getGroupDataKey(groupId)` — **unversioned**, always the current active key |
| **Version handling** | Backend stamps `groupKeyVersionId` on every `Expense` row at write time; the frontend threads it back through decryption | Backend `AuditLog.metadataJson` carries **no key-version stamp at all** — see Identified Risks |
| **Retry behavior** | Coordinator retries up to `MAX_DECRYPTION_ATTEMPTS` with backoff while any item is in a retryable state, re-resolving/provisioning keys between attempts | None — single attempt per `fetchHistoryLogs()` call; a transient failure (session not yet ready, group key not yet cached, 429) is not retried |
| **Error handling** | `classifyDecryptionError` → `ExpenseDecryptionMeta{state, category, message}`, 7 distinct states, drives both UI copy and retry eligibility | Boolean "did we get a key" → one flat placeholder string for every failure mode; no distinction between temporary and permanent |
| **Cache usage** | `GroupKeyService`'s session-scoped in-memory cache (`groupKeysMemoryCache`), keyed `${groupId}:${versionId ?? 'active'}` | **Same cache**, same service, same `'active'` alias slot — no separate/duplicate cache exists |
| **Rotation behavior** | Correct: a rotated-out (`SUPERSEDED`, not `REVOKED`) version stays resolvable by version id, and expenses carry the id needed to request it | Broken for pre-rotation entries: only the active version is ever requested, and there is no stored version id to request an older one even if the backend would serve it — see Identified Risks |
| **Crypto primitive** | `ClientEncryptionService.decryptExpense`, which itself calls `ClientEncryptionService.decrypt` per field | `ClientEncryptionService.decrypt` directly — **the same primitive**, called one level lower. No cryptographic logic is duplicated. |

## Identified Risks

### R1 — Confirmed correctness gap: history decryption is not rotation-safe (Medium severity, currently latent)

- `Expense` rows are written with a `groupKeyVersion` relation (`backend/.../expense.entity.ts` via `expenses.service.ts`), which is exactly what lets `ExpenseDecryptionService` correctly decrypt an expense even after its group's key has since rotated.
- `AuditLog.metadataJson` (`shared/data-models/src/lib/audit-log.entity.ts`) has **no equivalent column**. When `expenses.service.ts` writes `previousTitle`/`newTitle` into audit-log metadata, it copies the expense's ciphertext verbatim — ciphertext that was produced under whatever group key version was active *at that time* — with no record of which version that was.
- `GroupsService.getHistoryLogs` always requests the *current active* key (`getGroupDataKey(groupId)`, no version argument). Once a group's key is rotated (`GroupKeyService.rotateGroupKey` → `POST /groups/:id/keys/rotate`, which the backend fully supports — old versions become `SUPERSEDED`, not `REVOKED`, and stay resolvable by version id), every pre-rotation history entry becomes **permanently** undecryptable through this code path — not "waiting," but silently and forever showing `DECRYPTION_FAILED_PLACEHOLDER`, indistinguishable in the UI from a corrupted or inaccessible entry.
- **Current exposure**: `rotateGroupKey` exists on both backend and frontend but has **no UI entry point today** (confirmed via repo-wide search — the method is defined but never called from any component). So this is a real, confirmed bug in the current code, but it is currently unreachable by any user action. It will start firing the moment key rotation is exposed in the UI, or any other caller invokes it (e.g. a future security-response flow).
- **Fix shape** (not undertaken here — out of scope for a design review, and would require a schema change, not a refactor): stamp the group-key version id onto audit-log metadata at write time (mirroring what `Expense.groupKeyVersion` already does), and have `getHistoryLogs` pass it to a version-aware key resolution call.

### R2 — Error UX duplication (Low severity, maintenance risk only)

- `classifyDecryptionError` is the audit's single source of truth for "why can't this be shown," but history never calls it — it only sees `CryptoKey | null` from `getGroupDataKey`, which already discards the richer `GroupKeyResult` status (`pending` / `no_access` / `rate_limited` / `no_session` / `error`) that `resolveGroupKey` produces internally.
- Practical effect: a user who opens the History tab before their session/group key has finished loading sees a permanent-looking "Unable to display this item" instead of the ledger's "Waiting for group encryption keys…" — for what is, in the ledger, an explicitly *temporary* and auto-recovering state.
- Future changes to `DECRYPTION_MESSAGES` or to the classification rules (e.g. adding a new recoverable case) will not propagate to history unless someone remembers to update this second, independent code path — the exact "developers may copy this pattern" risk the original audit flagged.

### R3 — No architectural/crypto duplication beyond the above

- The actual AES-GCM encrypt/decrypt primitive is not duplicated — history calls the same `ClientEncryptionService.decrypt` that the central pipeline calls internally.
- The key cache is not duplicated — both paths go through the same `GroupKeyService` in-memory cache.
- There is no second implementation of key *minting* or *provisioning* — history only ever reads a key that something else (the ledger view, opened first in every normal flow) already caused to be resolved/provisioned.

## Verify — Answers

**Does history require a dedicated decryptor?**
Yes, at least a thin one. Audit log metadata is shaped differently from an expense (up to three independently-encrypted fields per entry inside a free-form `metadata` blob, keyed by action type) rather than `DecryptableExpense`'s fixed `title`/`description` pair. A literal one-line reuse of `ExpenseDecryptionService.decryptExpense(s)` is not possible without first adapting each audit-log entry into a `DecryptableExpense`-shaped wrapper per field, which is more machinery than the current ~30-line inline loop.

**Should it reuse the central pipeline?**
Partially, and it already does for the parts that generalize cleanly: the same `GroupKeyService` cache and the same `ClientEncryptionService.decrypt` primitive. It should *not* be forced through `ExpenseDecryptCoordinator` — that component's retry loop, phase/summary signals, and (most importantly) its side-effecting key provisioning/minting are designed for the primary, always-open ledger view; wiring the same machinery into a secondary, tab-gated audit trail would duplicate provisioning attempts and UI-state bookkeeping for no benefit, since the ledger view (opened first, in every real flow) already drives provisioning. What it *should* reuse is the **classifier** (`classifyDecryptionError`/`ExpenseDecryptionMeta`) for consistent messaging — see Recommendation.

**Is version-aware key resolution required?**
Yes — this is R1, a confirmed gap, not a stylistic preference. `GroupKeyService.resolveGroupKey` already supports it; the missing piece is a `groupKeyVersionId` on `AuditLog.metadataJson`, which is a backend data-model change.

**Is the current implementation correct?**
Correct for the case it was evidently built for (no rotation has occurred). Not correct once a group's key is ever rotated — see R1. This is a latent, not active, defect given R1's UI-exposure note.

**Is there any architectural duplication?**
Only at the orchestration layer (retry/error-classification — R2), not at the cryptographic or caching layer (R3). The duplication that exists is narrow and already partially mitigated by both paths sharing `GroupKeyService`.

**Is there any future maintenance risk?**
Yes: R2 (silent drift between the two error-handling styles) and, more importantly, R1 will convert from a latent to an active defect the moment group key rotation gets a UI entry point — which is a reasonable, plausible next feature given `rotateGroupKey` already exists end-to-end on the backend and in `GroupKeyService`.

## Recommendation: Document Only (with one flagged bug tracked separately)

**Keep the current separation.** The dedicated, lighter-weight decryption path in `GroupsService.getHistoryLogs` is the right shape for what it does — a secondary, read-only, multi-field-per-row audit view — and forcing it through `ExpenseDecryptCoordinator` would add retry/provisioning machinery this view doesn't need without fixing anything. This finding should be closed as "intentional, now documented" rather than "refactor."

Two follow-ups are worth tracking, **outside this audit's scope** (per the "no behavior changes, no new features" rule for this review):

1. **File R1 as its own bug/fix task**: stamp `groupKeyVersionId` on audit-log metadata at write time and thread it through `getHistoryLogs`'s key resolution. This is a backend schema change plus a small frontend change, not a refactor of the decryption architecture, and should not be done as an incidental part of a consolidation pass.
2. **Optional, low-risk follow-up for R2**: have `getHistoryLogs` call `classifyDecryptionError({ keyStatus, ... })` instead of collapsing straight to a boolean, so a user sees "Waiting for group encryption keys…" instead of a permanent-looking placeholder during normal transient loading. This is a pure UX-message improvement, not a behavior change to what decrypts or when — but it does change on-screen text, so it should go through its own reviewed change rather than be bundled here.

### Justification

- The two pipelines solve different problems (single ledger row vs. multi-field audit entry; primary always-open view vs. secondary tab) and sharing the heavyweight coordinator would be over-abstraction for the history case, contrary to this task's instruction to prefer documenting intentional differences over unnecessary abstraction.
- The one real defect found (R1) is not fixed by "reusing the central pipeline" — the central pipeline is only rotation-safe *because* expenses carry a version stamp that audit logs simply don't have yet. Consolidating the code without adding that stamp would not fix anything; adding the stamp without consolidating the code fully fixes it. The fix and the architecture question are orthogonal.
- No test, contract, or DTO changes are implied by this recommendation, satisfying "do not change behavior unless a clear bug is found" (R1 is that clear bug, and it is being handed off rather than silently patched here) and "do not introduce new features."
