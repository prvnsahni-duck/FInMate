# Expense Module Contract

The boundary contract for the Expense module. Claude must not mix responsibilities across this boundary.
Source: [expenses/](../../backend/src/app/expenses/) · Audit: [expense-audit.md](../audits/expense-audit.md)

## Responsibilities

- ✔ Store expenses as single rows with **client-encrypted** title/description.
- ✔ Persist splits (fixed/equal/percent/share) and validate that split sums equal the expense amount, server-side.
- ✔ Stamp `ledgerMonth` and the group `groupKeyVersionId` on write.
- ✔ Manage soft-delete + restore of expenses.
- ✔ Run recurring-expense templates and generate expenses via the scheduler (transactional, locked).
- ✔ Household month-close: compute net balances, carry-forward, all inside a transaction.
- ✔ Provide the raw data the dashboard/analytics aggregation joins over.

## Inputs

- Create/update DTOs with **ciphertext** title/description + encryption metadata (scope, wrapped content keys, key version).
- Split payloads (participant + type + value).
- Authenticated user context + group membership.

## Outputs

- Expense rows (ciphertext fields preserved for client decryption).
- Split rows.
- Aggregation query results (plaintext amount/currency/category/date only).

## Public APIs

- `POST/GET/PATCH/DELETE /expenses`, restore, recurring endpoints (see `expenses.controller.ts`, `recurring-expenses.controller.ts`).

## Events / side effects

- Writes `AuditLog` entries (with ciphertext title in metadata — see KI-1).
- Enqueues nothing async today (no queue exists).

## Dependencies

- Encryption/Key Management (key version resolution — read-only; the module never decrypts).
- Groups (membership + role authorization, currency base).
- Settlements (reads splits for balance/settlement).

## Must NEVER

- ❌ Decrypt titles/notes or accept plaintext for them.
- ❌ Store a computed dashboard/balance as its own source of truth.
- ❌ Duplicate an expense to represent a personal view.
- ❌ Update the search index directly (no server search exists; blind index is roadmap).
- ❌ Silently reset settled splits on edit — settled state changes require an adjustment trail (see EXP-001).
- ❌ Hard-delete splits when preserving ledger history (see EXP-004).
