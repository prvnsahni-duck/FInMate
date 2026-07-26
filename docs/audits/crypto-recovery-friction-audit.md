# Seamless Crypto Recovery UX — Friction Audit

Date: 2026-07-27.

Scope: making crypto recovery invisible whenever possible, without changing encryption algorithms, key hierarchy, `CryptoSessionManager`'s state machine, or the security model. Builds directly on the prior phase's `CryptoRecoveryPanelComponent` (one shared unlock UI replacing three separate password prompts).

Files read in full for this audit: `crypto-session-manager.service.ts`, `crypto-recovery-queue.service.ts`, `crypto-recovery-visibility.service.ts`, `crypto-unlock-provider.ts`, `password-unlock-provider.service.ts`, `expense-decrypt-coordinator.service.ts`, `expense-decryption.service.ts`, `expenses.service.ts`, `group-key.service.ts`, plus every crypto-recovery-adjacent call site in `create-expense-modal.component.ts`, `group-members.component.ts`, and `group-detail.component.ts`.

## 1. What This Phase Built

| Piece | File | Purpose |
| --- | --- | --- |
| `CryptoRecoveryQueueService` | `crypto-recovery-queue.service.ts` | `runWithRecovery(operation)` — runs `operation` once; on a genuine crypto-session failure (verified via a fresh `ensureCryptoContext()` check, not a cached signal read), holds it and re-runs it automatically the moment `CryptoSessionManager` next reports `Ready`. Concurrent callers all queue on the same drain. |
| `CryptoRecoveryVisibilityService` | `crypto-recovery-visibility.service.ts` | Mount-order stack — when several `<app-crypto-recovery-panel>` instances exist at once (e.g. a modal opened over a page), only the most-recently-mounted one renders; the underlying one reappears once the top one is destroyed. |
| `CryptoUnlockProvider` / `CRYPTO_UNLOCK_PROVIDERS` | `crypto-unlock-provider.ts` | Interface (`id`, `label`, `inputType`, `unlock(credential?)`) + multi-injection token. `PasswordUnlockProvider` is now the only registered implementation, but the panel no longer hardcodes "password" anywhere in its logic or template — see §4. |

`CryptoRecoveryPanelComponent` itself (from the prior phase) needed no security-relevant changes — only injecting the visibility service (to pick `isTopmostInstance`) and the provider list (to render `activeProvider().label`/`inputType` instead of a literal "password").

## 2. Resume-After-Unlock: Wired Surfaces

Per the request, all five named surfaces were checked. `runWithRecovery` was wired wherever an operation could fail specifically because the master session (not a group-key-specific `pending`/`no_access`/`rate_limited` condition) wasn't ready:

| Surface | Call site | Before | After |
| --- | --- | --- | --- |
| Create Expense | `resolveGroupScopeKey()` in `onSubmit()` | A `no_session` classification threw immediately; the whole submit was abandoned and the user had to unlock, then click Save again. | Queued; once unlocked, the same `onSubmit()` invocation continues automatically into encrypt+POST. |
| Create Expense | `ExpensesService.createExpense()`/`updateExpense()` | These do their **own**, separate `ensureCryptoContext()`/`ensureGroupKey('write')` resolution inside `encryptPayload()` — independent of the check above. A session hiccup landing exactly here surfaced as a one-off save failure with no auto-retry. | Wrapped too, calling `createExpense`/`updateExpense` fresh inside the operation (not resubscribing to an already-built Observable) so a requeued retry genuinely re-runs `encryptPayload()`, not just re-observes the first failed attempt. |
| Group Members | `sendBulkInvites()` / `generateSecureInviteLink()` via `ensureGroupKey()` | Session-blocked case set a flag and returned silently; UI relied on the user re-clicking Invite after unlocking. | `ensureGroupKey()`'s null result now routes through a `resolveGroupKeyOrThrow()` wrapper so `runWithRecovery` can queue it; the invite/link flow resumes and completes on its own. |
| Group Detail | (no separate page for group-level recovery beyond the shared panel) | Already relies on the cross-tab-reactive `initializeGroupKeysAndSelfHeal()` re-run added in the prior phase. | Unchanged — already correct; see §3.1. |
| Receipt decryption | `downloadAttachment()` → `expenseDecryption.resolveExpenseKey()` | `resolveExpenseKey()` never rejects (it swallows session failures into `keyStatus:'no_session'`), so a naive wrap around it would do nothing. Failure surfaced as a blocking `alert()` the user had to dismiss before clicking download again. | The null-key check now throws **inside** the operation passed to `runWithRecovery`, so a genuine session block is queued and the whole decrypt-and-save flow resumes automatically; a real, non-recoverable failure (e.g. missing attachment bytes) still alerts immediately, unchanged. |

Regression tests were added for each of these (queued-then-resumes, and non-session failures still surfacing their existing message) in the corresponding `*.component.spec.ts` files, plus a dedicated `crypto-recovery-queue.service.spec.ts` and `crypto-recovery-visibility.service.spec.ts` for the two new services directly.

## 3. Remaining Friction — Audited

### 3.1 Bulk expense-list decryption (Group Detail's expense list) — already good, no change needed

`ExpenseDecryptCoordinator` already implements its own self-healing retry loop (`decryptPass` → `recoverKeys` → backoff → re-`decryptPass`, gated by `shouldRetry`/`isRetryable`) independent of `CryptoRecoveryQueueService`. It settles on its own once keys become available, with no user action and no repeated banners — this is a different, already-correct mechanism for a different problem shape (many items, partial success) and wasn't touched.

### 3.2 Duplicate key-resolution passes in Create Expense — real architectural overlap, not a UX bug

`resolveGroupScopeKey()` (used for `scopeKeyStatus`/UI) and `ExpensesService.encryptPayload()` (used for the actual encrypt+POST) independently resolve the group key via two different code paths — the first calls `GroupKeyService.resolveGroupKey()` directly, the second goes through `CryptoSessionManager.ensureGroupKey('write')`. Both are now wrapped in `runWithRecovery` (§2), so neither can strand the user, but the duplication itself is a pre-existing design overlap, not something this UX-only phase should collapse (doing so would change how/where group keys are resolved, not just how recovery is presented). Flagged for a future pass, not attempted here.

### 3.3 Queued operations aren't scoped to component lifetime — real gap, documented, not implemented

`CryptoRecoveryQueueService` is a `providedIn: 'root'` singleton; a queued closure captures `this` from whatever component created it and fires whenever the session next becomes `Ready`, regardless of whether that component is still mounted. Concretely: if a user starts a receipt download that gets queued, then navigates away from Group Detail before unlocking (e.g. unlocks from a different page, or another tab), the download can still fire later against a torn-down component — for `downloadAttachment()` specifically, this means a file could download unexpectedly after the user has moved on. This is a minor surprise, not a correctness or security issue (no stale/wrong data — the operation re-resolves everything fresh on retry), and no crash results (Angular signals/EventEmitters on a destroyed component are inert, not throwing). Given the "UX-only, no state-machine changes" constraint and that this requires deciding a cancellation contract for the queue (e.g. `runWithRecovery(operation, { destroyRef })` dropping the entry silently on destroy), it's recommended as the next small addition rather than implemented in this pass.

### 3.4 Everything else audited: no remaining friction found

- **Repeated retries**: `CryptoSessionManager.handleRecoverableFailure`'s 2-silent-attempts-then-`RecoveringBlocked` policy is unchanged and already prevents infinite silent loops; `runWithRecovery` only ever retries a queued operation once per `Ready` transition (verified by `crypto-recovery-queue.service.spec.ts`'s "does not retry in a loop if the resumed attempt fails again").
- **Repeated banners**: fully addressed by `CryptoRecoveryVisibilityService` — verified for the exact scenario named in the request (a modal, e.g. Create Expense, mounted over a page that also renders the panel).
- **Duplicated unlock requests**: one shared panel, one unlock provider call, one `ensureCryptoContext()` — all waiters on `CryptoRecoveryQueueService` resume from that single event, verified by the "resumes multiple concurrently-queued operations together" test.
- **Lost navigation state**: not applicable beyond §3.3 — resume-after-unlock means the user's in-progress action (Save, Invite, Download) continues from where it paused rather than being abandoned, so there's no state to lose in the first place for the five audited surfaces.
- **Manual refresh requirements**: none remain on the five named surfaces; the prior phase's cross-tab `crypto-session-ready` handling (Group Detail re-running `initializeGroupKeysAndSelfHeal`) already covers the multi-tab case, and this phase's queueing covers the single-tab "unlock, then continue" case.

## 4. Trusted-Device Extension Point (architecture only, not implemented)

`CryptoUnlockProvider` (id, label, inputType: `'text-secret' | 'trigger-only'`, `unlock(credential?)`) is registered via the `CRYPTO_UNLOCK_PROVIDERS` multi-provider token. `CryptoRecoveryPanelComponent` now renders whichever provider is active (`activeProvider()`) generically — label, input visibility, and the unlock call itself all go through the interface, with no `'password'`-specific branching left in the panel. `PasswordUnlockProvider` is the only implementation registered today (`app.config.ts`), but a future PIN or biometric provider would only need to implement the interface and register itself in the same array — no panel or template changes required. This was verified by a test that swaps `mockPasswordProvider.label` and confirms the rendered `aria-label` follows it, proving no hardcoded string remains in the active path.

## 5. Verification

- `npx nx run frontend:typecheck` — clean.
- `npx nx test frontend` — full suite passing (304 tests), including new specs for `CryptoRecoveryQueueService`, `CryptoRecoveryVisibilityService`, `PasswordUnlockProvider`, the panel's provider/visibility wiring, and regression tests for each of the five wired surfaces.
- Each new regression test was verified non-tautological: the corresponding fix was reverted, the specific test was confirmed to fail, then the fix was restored.
