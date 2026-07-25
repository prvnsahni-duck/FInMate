# Expense Module Freeze Verification

Date: 2026-07-25
Scope: expense CRUD, splits, recurring expenses, Carry Forward, Settlement, group History, and
the encryption/decryption path those workflows depend on. Verification only — no application
code was modified to produce this report (see "Findings requiring no fix" for why).

This report closes out the sequence of work recorded in `docs/audits/expense-architecture-audit.md`
and `docs/changes/*.md`. It is a fresh, independent re-verification, not a restatement of those
documents' own claims.

## Verification Checklist

### Implementation

- [x] **No duplicate business logic remains.** Confirmed by repo-wide search: `simplifyDebts` in
      both `SettlementsService` and `ExpensesService` are thin wrappers around the single
      `simplifyLedgerDebts` (`backend/src/app/common/ledger-debt-simplifier.ts`); `SplitCalculator`
      (the duplicate class) no longer exists anywhere in `shared/utils`; `mapExpenseResponse` and
      `batchMapExpenseResponses` both call the single `toExpenseResponse`; member display-name
      resolution has exactly one backend resolver (`common/member-display.util.ts`) and one frontend
      resolver (`features/groups/utils/member-display.util.ts`).
- [x] **One source of truth exists for every major responsibility.** See Architecture Summary
      below — verified per-area, not asserted.
- [x] **No dead production code remains.** `ExpensesAccessService`, `GroupKeyService.refreshGroupKey`/
      `clearLocalState`, `ZkKeyVaultService.storeGroupKey`/`loadGroupKey`/`deleteGroupKey` — zero
      matches for any of these names anywhere in `backend/`, `frontend/`, or `shared/` outside their
      own (now-removed) definitions. The one surviving name collision,
      `GroupDetailComponent.refreshGroupKey()` (a live, UI-bound component method, distinct from the
      removed `GroupKeyService` method of the same name), was re-confirmed unaffected.
- [x] **No obsolete APIs remain.** Same evidence as above; `shared/utils`' `SplitCalculator`/
      `SplitInput`/`SplitResult` are gone, and nothing imports them.
- [x] **No TODO/FIXME/HACK comments indicate unfinished expense-module work.** Zero matches in
      `backend/src/app/expenses`, `backend/src/app/settlements`, `backend/src/app/common`,
      `frontend/src/app/features/groups`, `frontend/src/app/core/services/group-key.service.ts`,
      `expense-decryption.service.ts`, `expense-decrypt-coordinator.service.ts`, and
      `shared/utils/src/lib/split-calculator.ts`.

### Architecture

Ownership re-verified for all twelve areas (single owner each, confirmed by reading the
current implementation, not by re-reading prior session notes):

| Area                    | Sole owner                                                                                                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expense CRUD            | `ExpensesService` (backend/src/app/expenses/expenses.service.ts), facaded by `ExpensesCrudService`                                                                                      |
| Encryption              | `ClientEncryptionService` (client-side only; backend never encrypts/decrypts content)                                                                                                   |
| Decryption              | `ExpenseDecryptionService` + `ExpenseDecryptCoordinator` for the ledger; `GroupsService.getHistoryLogs` for History (intentionally separate — see Limitations)                          |
| Group key lifecycle     | `GroupKeyService`                                                                                                                                                                       |
| Session key cache       | `GroupKeyService`'s in-memory `groupKeysMemoryCache` (confirmed: no IndexedDB group-key path remains anywhere in the code, matching the `ARCHITECTURE.md` correction made in this pass) |
| Carry Forward           | `ExpensesCarryForwardService` / `ExpensesService.closeMonth`, HTTP surface owned by `GroupsController`                                                                                  |
| Settlement              | `SettlementsService`                                                                                                                                                                    |
| History                 | `GroupsService.getHistoryLogs` (frontend) + backend `groups-audit.service.ts` write path                                                                                                |
| Response mapping        | `ExpensesService.toExpenseResponse`                                                                                                                                                     |
| Display-name resolution | `common/member-display.util.ts` (backend), `features/groups/utils/member-display.util.ts` (frontend) — one per runtime, by design                                                       |
| Split calculation       | `calculateDeterministicSplits` in `shared/utils`, wrapped (not reimplemented) by `backend/src/app/expenses/split-calculator.util.ts`                                                    |
| Debt simplification     | `simplifyLedgerDebts` in `backend/src/app/common/ledger-debt-simplifier.ts`                                                                                                             |

### Documentation

- [x] **Canonical documentation map is correct.** `docs/architecture/canonical-sources.md` and
      `docs/EXPENSE_MODULE_STATUS.md` name exactly one primary document per topic for all twelve
      topics; verified by reading both files in full this session.
- [x] **No conflicting documentation exists.** One real conflict was found and fixed _in the prior
      documentation pass, not this one_: `ARCHITECTURE.md` §2 claimed group keys persist to IndexedDB,
      contradicting `docs/group-key-flow.md`'s session-memory-only model. Re-verified fixed and
      consistent in this pass.
- [x] **Historical audit documents remain unchanged.** Confirmed via `git log --name-status -- docs/audits/`
      across every commit made in this body of work: the only audit-directory changes are two new
      files (`expense-architecture-audit.md`, `history-decryption-audit.md`); no pre-existing audit
      file was modified.
- [x] **No stale references remain** to any removed API name, in either code or documentation
      (repo-wide search, this session).

### Testing

- [x] **TypeScript compiles** — `tsc --noEmit` clean (0 errors) for `backend/tsconfig.app.json`,
      `frontend/tsconfig.app.json`, `shared/utils/tsconfig.lib.json`, re-run fresh for this report.
- [x] **Lint passes** — `eslint` re-run fresh over every directory touched across this body of work
      (`backend/src/app/{expenses,settlements,common,groups}`, `frontend/src/app/features/groups`,
      `frontend/src/app/core/services/{group-key,zk-key-vault,expense-decryption,expense-decrypt-coordinator}.service.ts`,
      `shared/utils/src`): **0 errors** (389 + 146 pre-existing `@typescript-eslint/no-explicit-any` /
      `no-non-null-assertion` warnings, none new).
- [x] **Existing test suites pass** — re-run fresh, full suites (not just the affected subset):
      backend 386/386 (29 suites), frontend 226/226 (28 suites), `shared/utils` 1/1.
- [x] **No skipped tests were introduced** — repo-wide search for `.skip(`, `xit(`, `xdescribe(`,
      `it.todo(`, `.only(` across every `.spec.ts` in `backend/src/app`, `frontend/src/app`, and
      `shared/utils` returned zero matches (the two `.skip(` hits in non-spec files are TypeORM
      pagination calls, not test skips).

### Known Limitations

- [x] Confirmed the two pre-specified limitations are real, current, and correctly scoped (see
      below).
- [x] **One additional pre-existing item found during this verification, outside this work's
      scope** — reported below, not silently added to the "intentional limitations" list, since it
      wasn't part of the consolidation work and wasn't previously framed as intentional.

## Final Architecture Summary

The expense module stores expenses as single, client-encrypted rows with server-validated splits.
Group-scoped expenses stamp `groupKeyVersionId` at write time, keeping them decryptable across
key rotations. Three workflows build on the same ledger: Carry Forward and Settlement both reduce
member balances to a minimal payment set via one shared algorithm; History is a read-only audit
trail that intentionally uses a separate, lighter-weight decryption path rather than the ledger's
full retry/provisioning coordinator, because it decrypts a different data shape (up to three
ciphertext fields per audit entry vs. one title/description pair) and doesn't need ledger-view
machinery.

Every previously-duplicated concern in this module now has exactly one implementation: debt
simplification, split calculation, expense response mapping, and member display-name resolution.
Six confirmed zero-caller dead APIs were removed. Group-key session caching is confirmed
session-memory-only end to end, with no lingering IndexedDB group-key path in code or docs.

## Remaining Intentional Limitations

1. **Audit-log encryption requires versioned metadata before exposing group-key rotation.**
   `AuditLog.metadataJson` carries no `groupKeyVersionId`, unlike `Expense` rows, so History
   decryption always uses the _current active_ key. After a rotation, pre-rotation history
   entries become permanently undecryptable. Currently latent — `GroupKeyService.rotateGroupKey`
   has no UI entry point. Tracked as **KI-1** in `docs/KNOWN_ISSUES.md`, independently confirmed
   by `docs/audits/history-decryption-audit.md` and `docs/audits/expense-audit.md` finding #7.
2. **Dormant `direct_shared` support.** Full entity/DTO/decryption plumbing exists, but backend
   validation unconditionally rejects creating a direct-shared non-group expense, and the frontend
   never emits the scope. Intentional per `docs/audits/expense-architecture-audit.md` P2-5 —
   reachable, validated code, not dead code, so it was correctly left untouched by the legacy
   cleanup.

No other item from the consolidation work in this session (debt simplification, split
calculation, response mapping, display-name resolution, legacy cleanup) introduced or left behind
a new limitation. Both items above pre-date this session's work and were independently
re-confirmed, not newly discovered.

### Additional item found during this verification (pre-existing, out of scope)

While spot-checking whether `docs/audits/expense-audit.md`'s other findings were still current
(several were: findings #5/#6/#10 — split soft-delete, split versioning, and the settled-split
reset-on-edit gap — are **resolved** in the current codebase; `ExpenseSplit` now has both
`@DeleteDateColumn` and `@VersionColumn`, and `updateExpense` soft-deletes and version-records
replaced splits instead of hard-deleting them), one item is **still present**:

- **Settlement `note` is not `@IsCiphertext`-validated.** `shared/data-models/src/lib/dto/settlement.dto.ts`'s
  `note` field has no `@IsCiphertext` decorator, unlike expense `title`/`description`, even though
  `DATABASE_SCHEMA.md` documents it as client-side encrypted. A client could persist a plaintext
  note; nothing currently enforces otherwise server-side. This was already documented (as
  "Undocumented behavior #5") in `docs/audits/expense-audit.md`, is unrelated to this session's
  consolidation work, and was not touched by it. **Not fixed here** — it's outside this freeze
  verification's scope and not a regression introduced by the work being frozen; flagging it for
  the deferred-work list below rather than fixing it silently, per this task's rule against
  unscoped changes.

## Deferred Future Work

- Resolve the audit-log key-version gap before any group-key-rotation UI ships — either stop
  persisting titles in audit metadata (KI-1 Option 1, agreed direction for v2.1) or stamp
  `groupKeyVersionId` onto `AuditLog.metadataJson` and thread it through a version-aware history
  decrypt call (KI-1 Option 2).
- Decide the `direct_shared` non-goal question: ship it, or remove the dormant plumbing.
- Add `@IsCiphertext` validation to `Settlement.note` (or formally re-document it as
  server-visible), closing the gap found above.
- `docs/audits/expense-audit.md` is now materially stale on findings #5/#6/#10/#11/#4 (all
  resolved since 2026-07-16) — left unedited per this repo's "historical audits are immutable"
  convention, but a future refresh pass (not this one) should record that those specific findings
  no longer apply, the way this report does.

## Freeze Confirmation

**FREEZE WITH KNOWN LIMITATIONS**

Implementation, architecture, documentation, and tests are internally consistent. No duplicate
logic, dead code, obsolete APIs, unfinished-work markers, skipped tests, or documentation
conflicts remain in the areas this work touched. The two pre-specified intentional limitations
are real, correctly scoped, tracked, and non-blocking (both are explicitly deferred, documented
future prerequisites, not unresolved defects in frozen code). One additional pre-existing,
out-of-scope gap (settlement note encryption) was found and is reported above rather than
silently fixed or silently omitted.

This module is ready to freeze on the condition that the two documented limitations — and their
listed future prerequisites — remain tracked and are not silently forgotten once the freeze takes
effect.
