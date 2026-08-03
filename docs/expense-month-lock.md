# Expense month-lock (controlled post-month editing)

Group expenses get a short grace period after a month ends, then that month is
**closed**: its expenses become fully read-only and can no longer be edited or
deleted. This keeps financial reports, group balances, and monthly analytics
stable once a month is finalized.

## Policy

Applies to **group / shared** expenses only. Personal expenses are always
editable by their owner and never pass through this lock. All group types share
one rule, including **household** groups — which are keyed by their accounting
`ledgerMonth` rather than the transaction date, but get the same grace window.

| Expense month                            | Edit any field | Delete |
| ---------------------------------------- | :------------: | :----: |
| Current calendar month                   |       ✅       |   ✅   |
| Previous month, up to & incl. the cutoff |       ✅       |   ✅   |
| Previous month, after the cutoff         |       🔒       |   🔒   |
| Any older month                          |       🔒       |   🔒   |

- **Cutoff** = `MONTH_LOCK_DAY` (default **7**) of the _following_ month,
  inclusive, end of day (local time). A July expense is editable through
  Aug 7 23:59:59.999; from Aug 8 it is locked. December rolls into January
  automatically.
- After the cutoff the month is **completely** locked — there is no
  metadata-only exception. Title, notes, amount, date, category, payer, split,
  and receipts are all read-only, and delete is refused.

A blocked write returns **HTTP 403** with:

```
This expense belongs to a closed month. Expenses from previous months can only
be modified until the 7th day of the following month.
```

(error code `EXP_EDIT_WINDOW_LOCKED`; the ordinal in the message reflects the
configured `MONTH_LOCK_DAY`.)

## Where it lives

- **`ExpenseEditPolicyService`** (`backend/.../expenses/services/expense-edit-policy.service.ts`)
  is the single source of truth. Pure and side-effect free given a date + a
  clock, so it is exhaustively unit-tested. Exposes
  `canEditFinancialFields()`, `canEditMetadata()`, `canDeleteExpense()`,
  `getPolicy()`, and the `assertCanEdit()` / `assertCanDelete()` enforcement
  helpers.
- **`ExpensesService`** enforces it: `assertWithinEditWindow` delegates to the
  policy, and `ensureExpenseAccess(write=true)` runs it for every group write
  (update _and_ delete). Enforcement is server-side and independent of the
  client — a hand-crafted request that changes a locked field is still refused.
- **Frontend** (`group-detail.component.ts`) mirrors the rule for UX only
  (lock badge + tooltip, hidden edit/history/delete actions). The cutoff is the
  shared `MONTH_LOCK_DAY` constant in `core/constants/app.constants.ts`; keep it
  in sync with the backend env value.

## Configuration

`MONTH_LOCK_DAY` (env, default `7`, clamped to `1–28`). Not hardcoded — see
`.env.example`.

## Audit

Every accepted edit already updates `updatedAt` / the actor and writes an
`expense.updated` audit-log entry via `writeAuditLog`; deletes write
`expense.deleted`. No separate post-close audit path is needed because no edits
are accepted after close.

## Future-ready extension points

The policy takes an `ExpenseEditPolicyContext` designed so new rules can be
added without touching call sites:

- `now` — injectable clock (used by tests today).
- `monthLockDay` — per-call override, e.g. **group-specific closing dates**.
- `adminOverride` — bypass the lock, for a future **admin “reopen month”**.
- `lockedBeforeMonth` — a permanent `YYYY-MM` boundary for **fiscal-year /
  manual month-closing / permanent accounting periods**; months before it are
  locked forever regardless of the grace window.

`canEditFinancialFields` / `canEditMetadata` / `canDeleteExpense` are also kept
as three independent axes even though they currently always agree, so a future
policy (e.g. metadata-only corrections) can relax one without a broad refactor.
