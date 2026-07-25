# Legacy Code Cleanup

Date: 2026-07-25
Source: `docs/audits/expense-architecture-audit.md` ("Dead or Legacy Code" section) plus verification performed during this task.

## Objective

Remove confirmed dead code and obsolete APIs with zero production callers, without changing runtime behavior.

## Files Reviewed

| Candidate | Verdict |
| --- | --- |
| `GroupKeyService.refreshGroupKey` | Dead — removed |
| `GroupKeyService.clearLocalState` | Dead (already `@deprecated`) — removed |
| `ZkKeyVaultService.storeGroupKey` | Dead — removed |
| `ZkKeyVaultService.loadGroupKey` | Dead — removed |
| `ZkKeyVaultService.deleteGroupKey` | Dead — removed |
| `ExpensesAccessService` (whole class) | Dead — removed |
| `shared/utils` `SplitCalculator` / `SplitInput` / `SplitResult` | Dead, discovered during this task — removed |
| `shared/utils/src/lib/split-calculator.spec.ts` | Tested only the removed dead class, and was already **failing** — removed |
| `ZkKeyVaultService.storeKey` / `loadKey` / `deleteKey` / `clearAll` / `storePrivateWrappingKey` / `loadPrivateWrappingKey` / `deletePrivateWrappingKey` | Live — retained |
| `GroupKeyService.invalidateGroupKey` / `clearCache` / `clearPersistentCache` | Live — retained |
| `direct_shared` expense plumbing (audit P2-5) | Dormant, not dead (backend validation actively rejects it — a reachable code path, just currently blocked by a business rule) — **out of scope**, not touched |

## Verification Method

For every candidate, confirmed **zero production callers** via repo-wide search for `.methodName(` call sites (not just the definition), separately from a broader search covering docs/comments, before removing anything:

```
grep -rn "\.refreshGroupKey\(" .        → no matches (only the definition)
grep -rn "\.clearLocalState\(" .        → no matches
grep -rn "\.storeGroupKey\(|\.loadGroupKey\(|\.deleteGroupKey\(" .  → no matches
grep -rn "ExpensesAccessService" backend → only its own file + module registration
grep -rn "SplitCalculator\b|SplitInput\b|SplitResult\b" .  → only its own file + its own spec
```

## Files Changed

### Removed entirely

| File | Reason |
| --- | --- |
| `backend/src/app/expenses/services/expenses-access.service.ts` | `ExpensesAccessService.isWriteRole` was never injected anywhere; `ExpensesService` implements write authorization inline (`ensureExpenseAccess`). Registered as a NestJS provider/export but never constructor-injected by any controller or service. |
| `shared/utils/src/lib/split-calculator.spec.ts` | Tested only `SplitCalculator` (see below), which had no production callers. Additionally, **this suite was already failing** — 4 of 8 tests — because the class's expectations (mixed split-type success, old error message text) no longer match the canonical `calculateDeterministicSplits` algorithm it wraps, from a prior consolidation. Removing it deletes a broken, dead-code-only test rather than "fixing" a shim nothing calls. |

### Edited (dead members removed, rest of the file unchanged)

| File | Change |
| --- | --- |
| `backend/src/app/expenses/expenses.module.ts` | Removed `ExpensesAccessService` from the import, `providers`, and `exports` arrays. |
| `backend/src/app/expenses/services/index.ts` | Removed `export * from './expenses-access.service'`. |
| `frontend/src/app/core/services/group-key.service.ts` | Removed `refreshGroupKey()` (30 lines) and `clearLocalState()` (7 lines, already `@deprecated`). `invalidateGroupKey`, `clearCache`, `clearPersistentCache` — the methods that actually back UI key-refresh/reset flows — are untouched. |
| `frontend/src/app/core/services/zk-key-vault.service.ts` | Removed `storeGroupKey`/`loadGroupKey`/`deleteGroupKey` (thin wrappers around `storeKey`/`loadKey`/`deleteKey` keyed by `group:${groupId}`, per the audit: superseded when group keys moved to session-memory-only caching in `GroupKeyService`). The generic `storeKey`/`loadKey`/`deleteKey`/`clearAll` and the still-used `store/load/deletePrivateWrappingKey` wrappers are untouched. |
| `frontend/src/app/core/services/group-key.service.spec.ts` | The `ZkKeyVaultService` test double mocked `loadGroupKey`/`storeGroupKey`/`deleteGroupKey` — methods `GroupKeyService` never actually calls (confirmed: it only calls `zkVault.clearAll()`, inside `clearPersistentCache()`) and that no test in the file asserted on. Replaced the stale mock keys with a `clearAll` mock matching what the real dependency is actually used for. |
| `shared/utils/src/lib/split-calculator.ts` | Removed the `SplitCalculator` class and its `SplitInput`/`SplitResult` interfaces (34 lines) — a "bridge test consumers" shim from a prior split-calculator consolidation, with no consumers besides its own (now also removed) spec. `calculateDeterministicSplits`, `validateSplitParticipants`, `SplitCalculationError`, and their supporting types are untouched — they remain the canonical implementation used by the backend. |
| `docs/group-key-flow.md` | Updated the "Cache Rules" section, which documented `refreshGroupKey` as a current, callable API ("`refreshGroupKey` evicts cached entries for a group and fetches from the backend"). Rewrote it to describe `invalidateGroupKey` — the method that actually backs eviction today (used by `GroupDetailComponent.refreshGroupKey()`, a same-named but distinct **component** method that was already calling `invalidateGroupKey` + coordinator reinitialization, not the removed service method). |

### Reviewed, left untouched (historical/frozen documents)

`docs/audits/expense-architecture-audit.md`, `docs/product-decisions-v2-final.md`, and `docs/audits/expense-module-final-signoff-post-grot.md` all mention one or more of the removed names. All three are explicitly dated, point-in-time records ("audit only... reflects the code as present in the workspace at audit time"; "Owner-ratified decisions... No code changes accompany this document"; "evidence-only... every conclusion cites file · method · line, verified first-hand this session"). Consistent with how this multi-task cleanup effort has treated them throughout, they were left as-is rather than rewritten to reflect a later state — `docs/changes/*.md` is this repo's convention for recording what changed and why.

## Files Retained and Why

- **`direct_shared` expense plumbing** (entity/DTO/decryption surface) — the original audit (P2-5) explicitly separates this from the "Dead or Legacy Code" list: it is *dormant*, not dead. Backend validation actively rejects direct-shared non-group expenses (a live, reachable code path enforcing a business rule), unlike the six candidates above, which had zero callers at all. Not in this task's explicit review list; left untouched.
- **`ZkKeyVaultService.storeKey`/`loadKey`/`deleteKey`/`clearAll`** — actively used for the personal master-key vault (confirmed live via `zk-key-vault.service.spec.ts`'s "store and load key round-trip" tests) and for `store/load/deletePrivateWrappingKey`. Only the group-key-specific wrappers around them were dead.
- **`GroupKeyService.invalidateGroupKey`/`clearCache`/`clearPersistentCache`** — all have live callers (`GroupDetailComponent.refreshGroupKey()`, logout/reset flows) and are the methods `refreshGroupKey`/`clearLocalState` were redundant with.
- **`calculateDeterministicSplits`/`validateSplitParticipants`/`SplitCalculationError`** in `shared/utils/src/lib/split-calculator.ts` — the canonical, actively-used split algorithm (backend `split-calculator.util.ts` wraps it; `backend/src/app/expenses/split-calculator.util.spec.ts` covers it with 8 passing tests across equal/fixed/percent/share/mixed-type-rejection cases). Only the legacy `SplitCalculator` class built on top of it was dead.

## Verification Results

- **TypeScript compiles**: `tsc --noEmit` passed with zero errors for `backend/tsconfig.app.json`, `frontend/tsconfig.app.json`, and `shared/utils/tsconfig.lib.json`.
- **Lint passes**: `eslint` on every touched file (`expenses.module.ts`, `services/index.ts`, `group-key.service.ts`, `group-key.service.spec.ts`, `zk-key-vault.service.ts`, `split-calculator.ts`) produced 0 new errors or warnings. All remaining warnings (`@typescript-eslint/no-explicit-any`, a couple of pre-existing unused catch-bindings in `zk-key-vault.service.ts`) are unrelated pre-existing lint debt, unchanged by this cleanup.
- **Tests pass**:
  - Backend, full suite: `29 suites / 386 tests passed`.
  - Frontend, full suite: `28 suites / 226 tests passed`.
  - `shared/utils`, full suite: `1 suite / 1 test passed` (the broken `split-calculator.spec.ts` — 4 failing tests — is gone; the remaining `utils.spec.ts` was unaffected and unrelated).
- **No behavior changes**: every removal was a method/class with zero call sites — nothing in the runtime call graph changes. The one test-file edit (`group-key.service.spec.ts`) only replaced unused mock stubs; it does not change what the tests assert.

## Remaining Intentional Legacy Code

- **`direct_shared` expense encryption/decryption plumbing** — intentionally dormant per the original audit (P2-5), not removed here since it has live (though currently unreachable) callers and validation logic, unlike this task's candidates which had none.
- **`ZkKeyVaultService`'s Temporary Invite Key (TIK) path** and other items noted as "legacy" in `docs/group-key-flow.md`'s Key Types table (e.g. "Legacy/link invite unwrap path for recipients without a public wrapping key") were not part of this review's candidate list and were left untouched — they were not flagged as dead in the source audit.
- No other dead code was identified during this task's search of the audit trail (`docs/audits/*.md`) beyond the six explicit candidates and the one newly-discovered `SplitCalculator` shim.
