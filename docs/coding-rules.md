# Coding Rules

Non-negotiable rules for any change to FinMate. These encode the architecture's invariants so implementations don't drift.
See [frozen-decisions.md](frozen-decisions.md) for the decisions behind them and [architecture/gap-tracker.md](architecture/gap-tracker.md) for known violations.

## Zero-knowledge & crypto

1. **Never send ZK-protected plaintext to the backend.** Titles, descriptions, notes, goal titles, attachment filenames — encrypt client-side first.
2. **Never bypass encryption.** New user-content fields default to encrypted-at-rest with client keys unless they are explicitly on the plaintext list (amount, currency, category, dates).
3. **Backend must reject non-ciphertext** on ZK fields via `@IsCiphertext`. If you add a ZK field to a DTO, add the decorator.
4. **Reference the key version** on any new group-encrypted resource (`groupKeyVersionId`), and stamp/refresh it correctly on create AND update.
5. **Server never holds user keys or ZK plaintext.** No backend code path may decrypt group/personal content. `ENCRYPTION_KEY` is for server secrets only.
6. **Fail closed on missing secrets.** Required crypto/JWT env vars must throw at boot, never fall back to a default constant.

## Source of truth & derived data

7. **Never create a second source of truth.** Balances, dashboards, and analytics are **derived** from `expenses` + `expense_splits`. Don't persist a parallel balance.
8. **No duplicate expense records.** One expense = one row. Personal views come from joins, not copies.
9. **Projections/read-models are disposable** and must be rebuildable from source. Search indexes are derived. History/audit is append-only and read-only.
10. **ExpenseShare/split sums must equal the expense amount** — validate server-side, always.

## Ledger integrity

11. **Preserve history.** Use soft-delete; don't hard-delete ledger rows (expenses AND splits). Editing settled/finalized data creates adjustments — never silently mutate or reset settled state.
12. **Guard concurrent writes** with the version column + `CON_VERSION_CONFLICT`; delete/restore paths need version checks too.
13. **Money mutations run in a transaction.** Settlement, import, month-close, carry-forward — all-or-nothing.
14. **Respect currency consistency** — validate currency against the group base on every write path (including recurring + scheduler).

## Authorization & audit

15. **Check the caller's role, not just membership.** Role changes (especially promotion to owner) require an explicit caller-role check. Never trust the guard's allow-list alone.
16. **Audit security-sensitive actions** (auth events, key rotation, invites, role/ownership changes, contribution changes) with actor + SHA-256 `ipHash`.
17. **Enforce approved gates server-side.** Opt-in flags (e.g. AI) must be persisted and checked on the backend, not just in `localStorage`.

## General

18. **Offline-first intent:** don't assume the network; don't break the optimistic-lock reconciliation flow. (Full offline queue is roadmap — don't claim it works until built.)
19. **Rate-limit expensive / outward-facing endpoints** (email sends, AI proxy, auth) with an explicit throttle profile.
20. **Match existing conventions.** Reuse `response.util.ts`, `HttpExceptionFilter` error codes, the snake-naming strategy, and the module/service layout already in place.
21. **Keep docs honest.** If you implement or change a documented guarantee, update the relevant audit + gap-tracker row in the same change.
