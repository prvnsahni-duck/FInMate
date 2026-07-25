# Expense Module Architecture Audit

Date: 2026-07-25
Scope: audit only. No application code changes.

This audit reviews the current working tree for source-of-truth drift in the expense module and adjacent expense-owned workflows: encryption/decryption, group key use, history, Carry Forward, balances, settlement, refresh/invalidation, member resolution, and display names.

## Source-of-Truth Map

| Responsibility                        | Current owner                                                                                              | Notes                                                                               |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Expense HTTP routes                   | `backend/src/app/expenses/expenses.controller.ts`                                                          | Thin controller, delegates to facades.                                              |
| Expense CRUD and persistence          | `backend/src/app/expenses/expenses.service.ts`                                                             | Actual implementation owner. `ExpensesCrudService` is only a facade.                |
| Expense analytics                     | `backend/src/app/expenses/expenses.service.ts`                                                             | `ExpensesAnalyticsService` is only a facade.                                        |
| Split persistence and validation      | `backend/src/app/expenses/expenses.service.ts` + `backend/src/app/expenses/split-calculator.util.ts`       | Backend calculator is the active source of truth.                                   |
| Frontend expense encryption           | `frontend/src/app/features/groups/services/expenses.service.ts`                                            | Uses `ClientEncryptionService` and `GroupKeyService`; no separate crypto primitive. |
| Expense decryption                    | `frontend/src/app/core/services/expense-decryption.service.ts`                                             | Central pipeline for expense titles/descriptions and retryable state.               |
| Decryption orchestration              | `frontend/src/app/core/services/expense-decrypt-coordinator.service.ts`                                    | Owns provision/decrypt/retry loop.                                                  |
| Group key resolution, rotation, cache | `frontend/src/app/core/services/group-key.service.ts`                                                      | Owns versioned key resolution and session-memory cache.                             |
| Personal key resolution               | `frontend/src/app/core/services/encryption.service.ts`                                                     | Master key load/derive lives here; expense pipeline calls it for personal scope.    |
| Expense version history               | `backend/src/app/expenses/expenses.service.ts`                                                             | `recordExpenseVersion`, `recordSplitVersions`, and `getExpenseVersionHistory`.      |
| Group history feed                    | `backend/src/app/groups/groups.service.ts` + `frontend/src/app/features/groups/services/groups.service.ts` | Backend emits audit metadata; frontend decrypts selected metadata fields.           |
| Carry Forward                         | `backend/src/app/expenses/expenses.service.ts` via `ExpensesCarryForwardService` facade                    | Group controller owns HTTP surface.                                                 |
| Group balances and settlement         | `backend/src/app/settlements/settlements.service.ts`                                                       | `calculateGroupBalances`, `proposeSettlement`, `updateSettlement`.                  |
| Frontend refresh/invalidation         | `GroupDetailComponent` + `GroupKeyService` + coordinator                                                   | Component currently orchestrates manual refresh.                                    |
| Member/display-name resolution        | Multiple local helpers                                                                                     | Repeated in backend expenses/settlements and frontend group components.             |

## Findings

### P0

None found. I did not find a live path that stores plaintext expense titles/descriptions server-side or a second live Expense CRUD implementation competing with `ExpensesService`.

### P1

#### P1-1: Split calculation has two competing implementations with different semantics

- Active backend source: `backend/src/app/expenses/split-calculator.util.ts` via `ExpensesService.persistSplits` and `RecurringExpensesService`.
- Competing implementation: `shared/utils/src/lib/split-calculator.ts` exports `SplitCalculator` through `shared/utils/src/index.ts`.
- Evidence: repo usage search shows `SplitCalculator` is only used by its own spec, while `calculateDeterministicSplits` is used by backend expense and recurring services.
- Drift: backend calculator enforces all split lines use the same `splitType`; shared calculator supports mixing fixed, percent, share, and equal in one calculation.
- Impact: future code could import the shared utility and calculate different balances than the persisted backend ledger.
- Recommendation: remove the shared `SplitCalculator` or replace it with a re-export/test wrapper of the backend-approved deterministic algorithm.

#### P1-2: Group history decrypt bypasses the central expense decryption pipeline

- Central expense decryption owner: `ExpenseDecryptionService`.
- Bypass: `GroupsService.getHistoryLogs` manually calls `groupKeyService.getGroupDataKey(groupId)` and `encryptionService.decrypt` for `metadata.title`, `metadata.newTitle`, and `metadata.previousTitle`.
- Evidence: `frontend/src/app/features/groups/services/groups.service.ts` manually decrypts audit metadata; `ExpenseDecryptionService` handles expense rows only.
- Impact: history metadata uses the active/unversioned group key path and does not share the classified retry/error state from expense decryption. This preserves the known history-rotation caveat and creates a second decryption style developers may copy.
- Recommendation: either stop storing encrypted titles in group audit metadata, or introduce a small history-metadata decryptor that uses version-aware key resolution and the same classifier vocabulary.

#### P1-3: Debt simplification exists in both Settlement and Carry Forward paths

- Settlement owner: `SettlementsService.simplifyDebts`.
- Duplicate: `ExpensesService.simplifyDebts` for Carry Forward rollover.
- Evidence: both methods implement debtor/creditor matching, rounding, and deterministic tie-breaking with different DTO names.
- Impact: small algorithm changes, rounding fixes, or tie-breaking changes can diverge between suggested settlements and Carry Forward rollover expenses.
- Recommendation: extract a shared backend ledger debt simplifier used by both services, with domain-specific mapping at the call sites.

### P2

#### P2-1: Expense response mapping is duplicated inside `ExpensesService`

- `mapExpenseResponse` and `batchMapExpenseResponses` emit nearly the same response shape.
- `listExpenses` uses the batch mapper; create/update/get/restore/deleted-expense listing use the single mapper.
- Impact: new fields can easily be added to one mapper but not the other.
- Recommendation: keep the batch fetch optimization, but funnel both paths through one pure `toExpenseResponse(expense, splits, attachments, wrappedKeys)` mapper.

#### P2-2: Group key cache has stale public methods and legacy vault APIs

- `GroupKeyService.refreshGroupKey` is not called by production code; the UI method `GroupDetailComponent.refreshGroupKey` calls `invalidateGroupKey`, then `initializeGroupKeysAndSelfHeal`, then refetches expenses/balances.
- `GroupKeyService.clearLocalState` is marked deprecated and has no production callers.
- `ZkKeyVaultService.storeGroupKey`, `loadGroupKey`, and `deleteGroupKey` have no production callers after group keys moved to session-memory caching. `clearAll` is still used to purge legacy/personal vault data.
- Impact: stale APIs make it unclear whether group keys are session-only or IndexedDB-backed.
- Recommendation: remove or clearly quarantine legacy group-key vault methods and either use or remove `GroupKeyService.refreshGroupKey`.

#### P2-3: Member and display-name resolution is repeated in several layers

- Backend duplicates: `ExpensesService.carryForwardMemberDisplay` and `SettlementsService.memberDisplay`.
- Frontend duplicates: `GroupDetailComponent.getUserName`, `payerDisplayName`, `memberDisplayName`; `GroupBalancesComponent.getUserName`; `GroupMembersComponent.memberDisplayName`.
- Component-level expense split fallback mapping in `GroupDetailComponent.fetchExpenses` reconstructs split display fields from the local member list.
- Impact: pending/contact-backed members can render differently across ledger, balances, member list, Carry Forward, and settlement UI.
- Recommendation: add one shared display-name resolver per runtime boundary: backend DTO mapper for API responses and frontend helper for component rendering.

#### P2-4: `ExpensesAccessService` is effectively dead

- `ExpensesAccessService.isWriteRole` exists but is not used by `ExpensesService`, which implements write authorization inline in `ensureExpenseAccess` and create/update flows.
- Impact: it suggests a policy boundary that is not actually authoritative.
- Recommendation: remove it, or move expense write-role decisions into it and use it consistently.

#### P2-5: Direct-shared expense plumbing remains mostly dormant

- Entity/DTO/frontend decryption pipeline include `direct_shared` and `EncryptedExpenseKey` support.
- Backend validation currently rejects direct-shared non-group expenses with the message that shared expenses must belong to a group.
- Impact: not a live duplicate implementation, but it is dormant architecture surface that increases audit and test burden.
- Recommendation: document it as intentionally dormant or remove the unused direct-shared paths until the feature is actively implemented.

## Duplicate Implementations

| Area                     | Duplicates                                                            | Severity |
| ------------------------ | --------------------------------------------------------------------- | -------- |
| Split calculation        | Backend `calculateDeterministicSplits` vs shared `SplitCalculator`    | P1       |
| Debt simplification      | `SettlementsService.simplifyDebts` vs `ExpensesService.simplifyDebts` | P1       |
| Expense response mapping | `mapExpenseResponse` vs `batchMapExpenseResponses`                    | P2       |
| Display-name resolution  | Backend and frontend local helper copies                              | P2       |
| Group history decryption | Manual history decrypt vs central expense decryption style            | P1       |

## Dead or Legacy Code

- `shared/utils/src/lib/split-calculator.ts`: not used by app code; only its own tests import it.
- `ExpensesAccessService`: no production caller found.
- `GroupKeyService.clearLocalState`: deprecated alias with no production caller found.
- `GroupKeyService.refreshGroupKey`: no production caller found; UI uses `invalidateGroupKey` plus coordinator reinitialization instead.
- `ZkKeyVaultService.storeGroupKey/loadGroupKey/deleteGroupKey`: no production caller found after group-key caching moved to session memory.
- Direct-shared expense support: schema/service/decryption surface exists, but backend validation prevents live creation.

## Source-of-Truth Violations

- Split math has an active backend truth and an exported shared alternative with different behavior.
- History metadata decryption bypasses the central classified decryption pipeline.
- Carry Forward reimplements debt simplification instead of depending on the settlement/ledger simplifier.
- Display-name resolution has no single owner and is repeated across backend and frontend surfaces.
- Expense response mapping has two maintained shapes in one service.

## Recommended Cleanup

1. Promote `calculateDeterministicSplits` as the only split calculator and remove or replace `shared/utils` `SplitCalculator`.
2. Extract a backend `LedgerDebtSimplifier` used by settlement suggestions and Carry Forward rollover.
3. Collapse expense response mapping into one pure mapper called by both single and batch paths.
4. Create one backend member-display resolver and one frontend display helper; remove component-local copies where possible.
5. Decide whether group audit metadata should be decrypted by a dedicated version-aware history decryptor or stop carrying encrypted title metadata.
6. Remove stale group-key cache methods once legacy IndexedDB migration/purge expectations are satisfied.
7. Remove `ExpensesAccessService` or make it the actual write-role policy owner.
8. Mark `direct_shared` as intentionally dormant in docs or remove unused creation/update plumbing.

## Verification Notes

- Facade services (`ExpensesCrudService`, `ExpensesAnalyticsService`, `ExpensesCarryForwardService`) are not duplicate business implementations today; they delegate to `ExpensesService`.
- Current working tree has app-code changes outside this audit. This document reflects the code as present in the workspace at audit time.
