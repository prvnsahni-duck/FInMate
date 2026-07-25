# Debt Simplifier Consolidation

Date: 2026-07-25
Source: `docs/audits/expense-architecture-audit.md`, finding P1-3 ("Debt simplification exists in both Settlement and Carry Forward paths").

## Objective

Reduce debt simplification to exactly one implementation across the backend, so that suggested settlements and Carry Forward month-close rollover can never diverge on rounding, ordering, or tie-breaking.

## Files Changed

| File | Change |
| --- | --- |
| `backend/src/app/common/ledger-debt-simplifier.ts` | New. Canonical `simplifyLedgerDebts(balances, currency)` greedy debt-simplification algorithm, keyed by an opaque `key: string`. |
| `backend/src/app/settlements/settlements.service.ts` | `SettlementsService.simplifyDebts` now maps `MemberBalance[]` → `LedgerBalance[]`, delegates to `simplifyLedgerDebts`, and maps the result back to `SimplifiedTransaction[]`. Public signature, `MemberBalance`, and `SimplifiedTransaction` are unchanged. |
| `backend/src/app/expenses/expenses.service.ts` | `ExpensesService.simplifyDebts` (private, used by `closeMonth`'s Carry Forward rollover) now does the same map-delegate-map through `simplifyLedgerDebts`. Signature and return shape (`fromGroupMemberId`/`toGroupMemberId`) are unchanged. |

No DTOs, public method signatures, controller routes, or HTTP response shapes changed in either service.

## Previous Duplicate Implementations

Both services independently implemented the same greedy min-cash-flow algorithm:

- `SettlementsService.simplifyDebts(balances: MemberBalance[], currency: string): SimplifiedTransaction[]` — used by `calculateGroupBalances` to produce `suggestedSettlements`.
- `ExpensesService.simplifyDebts(balances: {groupMemberId, balance}[], currency: string)` (private) — used by `closeMonth` to generate Carry Forward rollover expenses/splits at month close.

### Comparison

Line-by-line comparison of the two pre-consolidation implementations showed they were **algorithmically identical**, differing only in field naming:

| Aspect | Settlements | Expenses (Carry Forward) | Match |
| --- | --- | --- | --- |
| Zero-balance tolerance | `Math.abs(b.balance) >= 0.01` | same | ✅ |
| Debtor/creditor tie-break | lexicographic `localeCompare` on the opaque id when balances differ by `< 0.0001` | same | ✅ |
| Debtor sort (no tie) | most-negative first | same | ✅ |
| Creditor sort (no tie) | largest-positive first | same | ✅ |
| Transfer amount | `Math.min(|debtor|, creditor)` | same | ✅ |
| Rounding | `Math.round(transferAmount * 100) / 100`, skip if `<= 0` | same | ✅ |
| Loop termination | stop when either side is empty | same | ✅ |
| Opaque key semantics | `MemberBalance.userId` is documented as actually holding a `GroupMember.id` (see comment at `settlements.service.ts:429`, preserved from before this change) | `groupMemberId` directly | ✅ (same underlying identity — `GroupMember.id`) |

No behavioral differences were found. Both call sites already operated on the same opaque identity space (`GroupMember.id`), just under different field names on the input/output DTOs. This confirms the audit's assessment — the risk was future drift, not a live bug.

## New Canonical Implementation

`backend/src/app/common/ledger-debt-simplifier.ts` exports:

```ts
export interface LedgerBalance { key: string; balance: number; }
export interface SimplifiedLedgerTransaction {
  fromKey: string; toKey: string; amount: number; currency: string;
}
export function simplifyLedgerDebts(
  balances: LedgerBalance[],
  currency: string,
): SimplifiedLedgerTransaction[]
```

It is a byte-for-byte port of the two prior method bodies (same tolerance, sort, tie-break, rounding, and loop logic), generalized to an opaque `key` field. Both services now call it and translate their domain-specific field names (`userId`/`groupMemberId`) at the boundary, keeping their public DTOs unchanged.

## Verification

- **Single algorithm**: `simplifyLedgerDebts` is the only place the greedy debt-simplification loop is implemented; both `SettlementsService.simplifyDebts` and `ExpensesService.simplifyDebts` are now thin adapters over it.
- **Identical results**: Settlement suggestions and Carry Forward rollover now share the exact same code path, not just equivalent logic — divergence is no longer possible by construction.
- **No API changes**: `SettlementsService.simplifyDebts` keeps its public signature and `MemberBalance`/`SimplifiedTransaction` types; `ExpensesService.simplifyDebts` stays private with the same input/output shape used by `closeMonth`. No controller, DTO, or route changed.
- **No behavioral changes**: rounding, ordering, and tie-breaking logic were moved verbatim into the shared function.

## Test Results

Ran the existing suites covering both call sites — no test changes were needed:

```
Test Suites: 3 passed, 3 total
Tests:       86 passed, 86 total
```

Suites run:
- `backend/src/app/settlements/settlements.service.spec.ts` — includes the `simplifyDebts (Core Math Algorithm)` suite (simple debt, rounding remainder, sorting/tie-breaking, net-zero, circular-debt cases) and `calculateGroupBalances` integration tests.
- `backend/src/app/expenses/expenses.service.spec.ts` — includes `closeMonth` integration tests exercising the Carry Forward rollover path that depends on `simplifyDebts`.
- `backend/src/app/expenses/services/expenses-carry-forward.service.spec.ts` — facade delegation tests for `closeMonth`.

`npx tsc --noEmit -p backend/tsconfig.app.json` also passed with no errors.
