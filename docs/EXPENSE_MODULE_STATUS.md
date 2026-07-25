# Expense Module Status

Date: 2026-07-25
Scope: the expense module and its directly-owned workflows — expense CRUD, splits, recurring
expenses, Carry Forward, Settlement, group history/audit, and the encryption/decryption path
those workflows depend on.

This document is a **rollup**, not a new canonical source. Each topic below links to the
document that is actually authoritative for it (per
[`architecture/canonical-sources.md`](architecture/canonical-sources.md)); this file exists so a
new engineer or AI agent can get oriented in one read before going to those documents for detail.

## Architecture Overview

The expense module stores expenses as single, client-encrypted rows (title/description ciphertext
only — amounts, dates, and categories are plaintext) with server-validated splits
(fixed/equal/percent/share). Group-scoped expenses stamp the `groupKeyVersionId` used to encrypt
them, so historical expenses stay decryptable across group-key rotations. The backend never
decrypts expense content.

Three workflows sit on top of the same ledger data:

- **Carry Forward** (household groups) — closes a billing month, nets each member's paid-vs-owed
  balance, and generates rollover expenses for the next month.
- **Settlement** — proposes and records debtor→creditor payments to zero out group balances.
- **Group History** — a read-only audit trail of expense create/update/delete/restore actions.

Carry Forward and Settlement both reduce a set of member balances to a minimal set of payments
using the same algorithm (see Recent Consolidations below); History decrypts a different data
shape than the ledger and intentionally uses a separate, lighter-weight decryption path (see
Known Intentional Limitations).

## Current Responsibilities

| Module                         | Owns                                                                                                                                        | Contract                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Expense                        | CRUD, splits, recurring templates, soft-delete/restore, version history, dashboard aggregation source                                       | [`contracts/expense-contract.md`](contracts/expense-contract.md)                                                 |
| Settlements & Friends Balances | Propose/update settlements, compute group and cross-group friend balances                                                                   | [`contracts/settlements-contract.md`](contracts/settlements-contract.md)                                         |
| Groups                         | Membership/roles, Carry Forward HTTP surface (delegates ledger math to Expense), group history/audit surface, group-key-version persistence | [`contracts/groups-contract.md`](contracts/groups-contract.md)                                                   |
| Encryption / Key Management    | Master key derivation, group key generation/wrap/unwrap/cache/rotation, classified key resolution                                           | [`contracts/encryption-contract.md`](contracts/encryption-contract.md), [`group-key-flow.md`](group-key-flow.md) |

Full responsibility/input/output/must-never boundaries live in each contract, not here — this
table is a map, not a restatement.

## Module Boundaries

Directional dependencies (who reads/depends on whom):

- **Expense → Encryption/Key Management** (read-only key resolution; Expense never decrypts
  server-side) **→ Groups** (membership + role authorization, currency base) **→ Settlements**
  (reads Expense splits for balance/settlement math).
- **Settlements → Expense** (splits are the balance source) **→ Groups** (currency-base rules).
- **Groups → Encryption/Key Management** (provisioning/rotation) **→ Expense** (Carry Forward
  delegates ledger math to `ExpensesCarryForwardService`/`ExpensesService`; deleted-expense and
  version-history listing) **→ Audit logging** (operational history).
- **Encryption/Key Management** has no dependency on the other three — every module holding
  encrypted data depends on it, never the reverse.

Boundary rules that most often get violated by accident (see each contract's "Must Never" for the
full list):

- Expense/Settlements must never decrypt title/note content server-side, or store a computed
  balance/dashboard aggregate as its own source of truth (it's always re-derived from expenses +
  splits + settlements).
- Groups must never mint a duplicate group key on invite or missing-key recovery, or change base
  currency after expenses/settlements exist.
- Encryption/Key Management must never transmit or store plaintext master keys, group keys, or
  private wrapping keys server-side, or mutate a historical key version instead of creating a new
  one on rotation.

These are enforced today (see the relevant contract for evidence anchors); this section only maps
where the boundary lines are, not why each rule exists.

## Canonical Documentation Map

| Topic                           | Canonical document                                                                                                                                                                                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expense architecture            | [`contracts/expense-contract.md`](contracts/expense-contract.md), [`architecture/architecture-inventory.md`](architecture/architecture-inventory.md)                                                                                                            |
| Encryption/decryption           | [`group-key-flow.md`](group-key-flow.md) → "Expense Decryption"; [`contracts/encryption-contract.md`](contracts/encryption-contract.md)                                                                                                                         |
| Group key lifecycle             | [`group-key-flow.md`](group-key-flow.md) → "Current Lifecycle"                                                                                                                                                                                                  |
| Session-memory group key cache  | [`group-key-flow.md`](group-key-flow.md) → "Cache Rules"                                                                                                                                                                                                        |
| Canonical group key convergence | [`group-key-flow.md`](group-key-flow.md) → "Canonical Key Resolution"                                                                                                                                                                                           |
| Expense lifecycle               | [`contracts/expense-contract.md`](contracts/expense-contract.md); [`ARCHITECTURE.md`](../ARCHITECTURE.md) §4 "Critical Ledger Mechanics"                                                                                                                        |
| Carry Forward                   | [`contracts/groups-contract.md`](contracts/groups-contract.md) → "Carry Forward Boundary"                                                                                                                                                                       |
| Settlement                      | [`contracts/settlements-contract.md`](contracts/settlements-contract.md)                                                                                                                                                                                        |
| History                         | [`contracts/groups-contract.md`](contracts/groups-contract.md) → "History / Audit Boundary"; [`audits/history-decryption-audit.md`](audits/history-decryption-audit.md) (architecture review); [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md) → KI-1 (tracked limitation) |
| API contracts                   | [`contracts/`](contracts/), [`../openapi.yaml`](../openapi.yaml)                                                                                                                                                                                                |
| Security model                  | [`ARCHITECTURE.md`](../ARCHITECTURE.md) §2; [`group-key-flow.md`](group-key-flow.md) → "Security Invariants"; [`SECURITY_VERIFICATION_CHECKLIST.md`](SECURITY_VERIFICATION_CHECKLIST.md)                                                                        |
| Refresh/invalidation flow       | [`group-key-flow.md`](group-key-flow.md) → "Cache Rules" (`invalidateGroupKey`, `clearCache`, `clearPersistentCache`)                                                                                                                                           |

If a topic document and the code disagree, the code wins and the topic document is stale —
fix the document, not this rollup (this file only needs to change when the map itself changes).

## Recent Architectural Consolidations

The expense architecture audit ([`audits/expense-architecture-audit.md`](audits/expense-architecture-audit.md),
2026-07-25) found several areas where the same logic had drifted into two independent
implementations. Each was resolved as a behavior-preserving internal refactor — same public APIs,
same DTOs, same business rules — recorded individually:

| Consolidation                  | What changed                                                                                                                                                                                                                                                                | Record                                                                                                 |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Debt simplification            | `SettlementsService.simplifyDebts` and `ExpensesService.simplifyDebts` (Carry Forward) now both call one `simplifyLedgerDebts` in `backend/src/app/common/ledger-debt-simplifier.ts`                                                                                        | [`changes/debt-simplifier-consolidation.md`](changes/debt-simplifier-consolidation.md)                 |
| Expense response mapping       | `mapExpenseResponse` (single) and `batchMapExpenseResponses` (list) now both call one pure `toExpenseResponse` mapper; only their data-loading strategy still differs                                                                                                       | [`changes/expense-response-mapper-consolidation.md`](changes/expense-response-mapper-consolidation.md) |
| Member display-name resolution | One backend resolver (`common/member-display.util.ts`) and one frontend resolver (`features/groups/utils/member-display.util.ts`) replace five duplicated implementations across Settlements/Expenses/three group components                                                | [`changes/display-name-resolver-consolidation.md`](changes/display-name-resolver-consolidation.md)     |
| Split calculation              | Backend `calculateDeterministicSplits` (in `shared/utils`) is the single split algorithm; the backend wrapper translates its errors to `BadRequestException`                                                                                                                | Predates this pass — see `docs/audits/expense-architecture-audit.md` P1-1 for the original finding     |
| Legacy/dead code removal       | Removed `ExpensesAccessService` (never injected), `GroupKeyService.refreshGroupKey`/`clearLocalState`, `ZkKeyVaultService.storeGroupKey`/`loadGroupKey`/`deleteGroupKey` (all zero-caller), and the `shared/utils` `SplitCalculator` legacy shim + its already-failing spec | [`changes/legacy-cleanup.md`](changes/legacy-cleanup.md)                                               |

One design review concluded the existing separation was correct and made **no code change**:
group history decryption (`GroupsService.getHistoryLogs`) stays a dedicated, lighter-weight path
rather than being merged into `ExpenseDecryptionService`/`ExpenseDecryptCoordinator`, because it
decrypts a different data shape (up to three ciphertext fields per audit entry vs. one
title/description pair) and doesn't need ledger-view retry/provisioning machinery. See
[`audits/history-decryption-audit.md`](audits/history-decryption-audit.md).

## Known Intentional Limitations

### History key-version limitation

Group history (`GroupsService.getHistoryLogs`) always decrypts audit-log title metadata with the
group's **current active** key. `AuditLog.metadataJson` carries no `groupKeyVersionId` stamp,
unlike `Expense` rows. After a group key rotation, pre-rotation history entries become
permanently undecryptable — indistinguishable in the UI from corrupted data.

- Tracked as **KI-1** in [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md), with an agreed direction (Option 1:
  stop persisting titles in audit metadata; render neutral phrasing like "updated an expense"
  instead) for v2.1.
- Independently confirmed at the architecture level by
  [`audits/history-decryption-audit.md`](audits/history-decryption-audit.md) and, earlier, by
  [`audits/expense-audit.md`](audits/expense-audit.md) finding #7.
- **Currently latent, not active**: `GroupKeyService.rotateGroupKey` exists end-to-end on both
  backend and frontend but has no UI entry point today, so no user has yet hit this in production.
  It becomes live the moment key rotation ships to the UI.

### Dormant `direct_shared` support

The `direct_shared` expense encryption scope has full entity/DTO/decryption plumbing
(`EncryptedExpenseKey`, wrapped content keys, frontend decryption support for the scope) but
backend validation (`validateExpenseEncryptionMetadata`) unconditionally rejects creating a
direct-shared non-group expense, and the frontend never emits the scope. This is intentional
dormant architecture surface, not a bug — see
[`audits/expense-architecture-audit.md`](audits/expense-architecture-audit.md) P2-5. It was
explicitly left untouched by the legacy-cleanup pass ([`changes/legacy-cleanup.md`](changes/legacy-cleanup.md))
because it is reachable, validated code, not zero-caller dead code.

## Future Prerequisites

- **Versioned audit-log encryption before group-key rotation ships a UI.** The History
  key-version limitation above is currently safe only because rotation has no UI trigger. Before
  exposing key rotation in the UI (or any other path that can invoke `rotateGroupKey`), either:
  1. ship KI-1 Option 1 (stop storing titles in audit metadata), or
  2. stamp `groupKeyVersionId` onto `AuditLog.metadataJson` at write time and thread it through a
     version-aware history decrypt call (KI-1 Option 2 / `history-decryption-audit.md` R1's fix
     shape).

  Shipping rotation UI without one of these first will surface KI-1 as a live, user-visible defect.

- **`direct_shared` non-goal decision.** If `direct_shared` expenses are never going to ship, the
  dormant plumbing should be removed rather than carried indefinitely (per
  `expense-architecture-audit.md`'s recommendation to "document as intentionally dormant or
  remove"). This status doc documents it as dormant; removal is a product decision, not something
  decided here.

## Module Status

- ✅ Feature complete — expense CRUD, splits (fixed/equal/percent/share), recurring expenses,
  soft-delete/restore, Carry Forward, Settlement, and group History are implemented and covered
  by passing tests. (`direct_shared` is intentionally dormant, not a completeness gap — see above.)
- ✅ Architecture consolidated — no duplicate implementation remains for debt simplification,
  split calculation, expense response mapping, or member display-name resolution (see Recent
  Architectural Consolidations).
- ✅ Legacy cleanup complete — all audit-flagged zero-caller dead code removed
  ([`changes/legacy-cleanup.md`](changes/legacy-cleanup.md)); no other dead code found in this
  module during that pass.
- ✅ Documentation current — this pass reconciled expense-module documentation against the
  current codebase; no unresolved drift remains in the canonical documents listed above.
- ✅ Ready for maintenance — remaining known gaps (History key-version limitation, dormant
  `direct_shared`) are documented, tracked (KI-1), and intentionally not blocking; the Future
  Prerequisites above tell a future maintainer exactly what must happen before rotation UI ships.

Independently re-verified in [`EXPENSE_MODULE_FREEZE.md`](EXPENSE_MODULE_FREEZE.md) (2026-07-25):
**FREEZE WITH KNOWN LIMITATIONS**.
