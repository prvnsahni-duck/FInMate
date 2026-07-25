# Groups Module Contract

Source: [`backend/src/app/groups/`](../../backend/src/app/groups/) and group-facing endpoints in [`backend/src/app/groups/groups.controller.ts`](../../backend/src/app/groups/groups.controller.ts). Audit snapshots live in [`../audits/groups-audit.md`](../audits/groups-audit.md) but this contract is authoritative.

## Responsibilities

- Manage groups, membership, roles, and join status.
- Enforce role-based authorization on group operations.
- Manage durable invite records and token join links.
- Archive groups; never hard-delete them.
- Lock base currency once group activity exists.
- Manage per-ledger-month member contribution percentages.
- Expose group history and deleted-expense views.
- Expose household carry-forward summary and month close endpoints.
- Own group key-version persistence through the membership service boundary.
- Audit group configuration, membership, expense-history, and carry-forward actions where implemented.

## Public APIs

- `GET /groups`, `POST /groups`, `GET /groups/:id`, `PATCH /groups/:id`, `DELETE /groups/:id`
- `POST /groups/join/:inviteToken`
- `POST /groups/:id/invites`, `POST /groups/:id/invite-link/regenerate`
- `GET /groups/:id/history`
- `GET /groups/:id/expenses/deleted`
- `GET /groups/:id/carry-forward?month=YYYY-MM`
- `POST /groups/:id/close-month`
- `GET /groups/:id/contributions?month=YYYY-MM`, `POST /groups/:id/contributions`
- Group key endpoints documented in [`encryption-contract.md`](encryption-contract.md)

## Carry Forward Boundary

`GroupsController` owns the HTTP surface because Carry Forward is a group workflow. The implementation delegates to `ExpensesCarryForwardService`, which delegates ledger math and writes to `ExpensesService`.

- Carry Forward is for household groups.
- `GET /groups/:id/carry-forward` returns net balances for a ledger month.
- `POST /groups/:id/close-month` requires `ledgerMonth` and creates rollover expenses in the next ledger month.
- The response includes `nextLedgerMonth` and `carryForwardExpenseCount`.

## History / Audit Boundary

- `GET /groups/:id/history` returns group-scoped audit history for active members.
- Soft-deleted expenses are listed through `GET /groups/:id/expenses/deleted` for restore/history UI.
- Expense entity history is stored separately in `expense_versions` and exposed through the expenses contract/API.
- Audit metadata may contain encrypted fields; the frontend is responsible for field-level decryption with the correct group key version when available.

## Dependencies

- Encryption/key management for provisioning and rotation.
- Users for membership identity and public wrapping keys.
- Expenses for group ledger, Carry Forward, deleted-expense listing, and expense version history.
- Audit logging for operational history.

## Must Never

- Allow role or ownership changes without checking the caller's role.
- Let the owner leave without transferring ownership.
- Hard-delete a group.
- Mint a duplicate group key on invite or missing-key recovery.
- Change base currency after expenses or settlements exist.
- Treat audit snapshots as canonical implementation docs after code changes.
