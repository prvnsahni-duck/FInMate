# Settlements & Friends Balances Contract

Source: [settlements/](../../backend/src/app/settlements/) · Audit: covered in [expense-audit.md](../audits/expense-audit.md)

## Responsibilities

- ✔ Propose/update settlements between users within a group, transactionally.
- ✔ Enforce settlement currency == group base currency (`SETTLE_CURRENCY_MISMATCH`).
- ✔ Keep settlements immutable except status transitions.
- ✔ Compute friends balances across mutual groups, virtualized per currency (`${friendId}_${currency}`).

## Inputs

- Settlement DTOs (debtor, creditor, amount, currency, optional note) · authenticated user + membership.

## Outputs

- Settlement rows · friends-balance projections (derived, per currency).

## Public APIs

- `settlements.controller.ts`, `friends.controller.ts`.

## Dependencies

- Expense/splits (balance source), Groups (currency base + membership).

## Must NEVER

- ❌ Mutate a settled record's financial fields (status-only after creation).
- ❌ Compute balances from anything other than expenses + splits + settlements.
- ❌ Accept a settlement currency that differs from the group base.
- ❌ Store a persisted friends-balance as a source of truth — it is derived.
