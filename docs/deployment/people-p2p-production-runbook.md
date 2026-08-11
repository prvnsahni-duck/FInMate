# People / P2P — Production Deployment Runbook

**Feature:** Splitwise-style person-to-person balances + multi-payer expenses.
**Migration:** `1719900000000-AddExpensePaymentsAndDirectLedger`
**Status at time of writing:** Ready for production. **Production migration NOT
run.** Local Postgres migration verified and reversible; Neon production
untouched.

> ⚠️ **Do not run the production migration until explicitly authorised.** This
> runbook is the procedure to follow _once_ authorised. Every command that writes
> to production is gated behind the confirmation steps below.

---

## 0. Readiness snapshot (verified)

| Check                                                | Result                                                                                                                       |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Working tree = only P2P Phase 1–3 changes            | ✓ (no unrelated changes)                                                                                                     |
| Backend migration present + registered               | ✓ `migrations/index.ts`                                                                                                      |
| `/people` API exists                                 | ✓ `people.controller.ts` (GET, GET/:id, POST txns, POST settlements, PATCH/DELETE)                                           |
| `/friends` → `/people` redirect                      | ✓ `app.routes.ts` (`pathMatch: 'full'`)                                                                                      |
| Frontend calls `/people`                             | ✓ `people.service.ts`                                                                                                        |
| Single-payer fallback keeps existing balances intact | ✓ verified (byte-identical, local)                                                                                           |
| Migration executed against production                | **NO** (only local `ts-node` harness against `localhost`; `npm run db:migrate` never run with the production `DATABASE_URL`) |
| Regression                                           | backend 515 ✓ · frontend 501 ✓ · builds ✓ · lint 0 errors · UAT 30/30                                                        |

---

## 1. Safety rules (apply to every step)

- **Never** print `DATABASE_URL`, credentials, tokens, or connection strings.
- **Never** dump financial records / user PII into logs or this report.
- **Never** run destructive SQL or manually edit ledger rows in production.
- **Never** run `db:migrate:revert` as a routine rollback (see §10).
- Use only the application's existing services and migrations.
- If a target database cannot be **positively identified** as the intended
  production DB, **stop**.

---

## Step 1 — Production backup (do first, before anything writes)

### ✅ Backup record — CONFIRMED (2026-08-11)

| Field                    | Value                                                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Backup/branch identifier | `pre-p2p-migration-backup`                                                                                                             |
| Parent branch            | `production`                                                                                                                           |
| Backup type              | Neon branch — data **and** schema                                                                                                      |
| Created                  | 2026-08-11 (reported "just now"); precise UTC per Neon console — ≈ `2026-08-11T13:40Z` (derived from the 7-day retention expiry below) |
| Expiry                   | 2026-08-18 19:10 (GMT+5:30) = `2026-08-18T13:40Z`                                                                                      |
| Target it protects       | production Neon (host confirmed out-of-band via Render/env — not recorded here)                                                        |

> Note: the backup branch **expires 2026-08-18**. Complete the production
> migration and its verification well before expiry, or refresh the branch, so a
> valid recovery point exists throughout the rollout window.

1. In Neon, create/confirm a backup: a **branch** or **point-in-time snapshot** of
   the production database taken immediately before migration.
2. **Record** (in the deployment ticket, not in logs): backup/branch identifier,
   timestamp (UTC), and who created it.
3. Positively identify the target:
   - Confirm the deploy environment's `DATABASE_URL` **host** is the intended
     production Neon endpoint (compare host only; do not echo the full URL).
   - Confirm `DB_SSL=true` for Neon.
4. **Stop condition:** if the backup is unavailable or the target DB cannot be
   confirmed, **do not continue**.

---

## Step 2 — Backend deployment order

The backend must understand the new schema before the frontend uses `/people`.
Deploy in this order:

1. **Deploy backend** (contains the new entities, `/people` module, and the
   migration). The backend stays backward-compatible with existing expenses via
   the **single-payer fallback** in `computeBalancesCore` (reads
   `expense_payments` when present, else falls back to `expenses.paid_by_*`).
2. **Run the database migration** (Step 3).
3. **Verify database invariants** (Step 4).
4. **Backend smoke tests** (Step 5).
5. **Deploy frontend** (Step 6) — only after 2–4 pass.

Because of the fallback, a backend deployed _before_ the migration still serves
correct balances (from the legacy payer columns); the migration then backfills
payment rows without changing any result.

---

## Step 3 — Run the production migration (GATED)

**Only after Step 1 is complete and you have been told "Run production
migration."**

1. Verify the environment points at the intended production DB (host check only;
   never echo the URL).
2. Do **not** use the local Postgres environment for this step.
3. Run the project's normal migration command from the production/CI context:

   ```
   npm run db:migrate
   ```

   This applies `1719900000000-AddExpensePaymentsAndDirectLedger`, which:
   - creates `expense_payments` and `direct_ledger_entries`,
   - **backfills one `ExpensePayment` per existing expense** from its primary
     `paid_by_*` + `amount_total` (idempotent via a `NOT EXISTS` guard; additive
     — no existing column is modified).

4. **Stop condition:** if the migration errors, **stop**, capture the error
   (message only, no secrets), and await approval. Do not retry blindly.

---

## Step 4 — Post-migration database verification (invariants)

Run these read-only checks (they return **counts only** — never row data). All
must hold:

```sql
-- (a) No expense left without an active payment row
SELECT count(*) AS orphan_expenses
FROM expenses e
WHERE NOT EXISTS (
  SELECT 1 FROM expense_payments p
  WHERE p.expense_id = e.id AND p.deleted_at IS NULL
);
-- expected: 0

-- (b) Payment amounts reconcile to the expense total (no mismatches)
SELECT count(*) AS sum_mismatches FROM (
  SELECT e.id
  FROM expenses e
  JOIN expense_payments p ON p.expense_id = e.id AND p.deleted_at IS NULL
  GROUP BY e.id, e.amount_total
  HAVING SUM(p.amount) <> e.amount_total
) x;
-- expected: 0

-- (c) No duplicate backfill (each expense backfilled at most once)
SELECT count(*) AS duplicate_backfills FROM (
  SELECT expense_id FROM expense_payments
  WHERE deleted_at IS NULL
  GROUP BY expense_id
  HAVING count(*) > 1
) d;
-- expected: 0 for pure single-payer state; any >1 here must correspond to a
-- genuinely multi-payer expense created AFTER go-live, not a backfill artefact.

-- (d) Legacy payer columns untouched (schema-level: the migration never writes
--     to expenses.paid_by_user_id / paid_by_group_member_id — confirm the
--     migration SQL only INSERTs into expense_payments; no UPDATE on expenses).
```

Required results: `orphan_expenses = 0`, `sum_mismatches = 0`, no unexpected
duplicate backfills. These exactly match the locally-verified invariants
(`verify-p2p-migration.ts` → 23/23, `uat-p2p.ts` → 30/30).

**Stop condition:** any non-zero `orphan_expenses` or `sum_mismatches` → **stop**.

---

## Step 5 — Existing balance parity (critical)

The migration must **not** change any existing balance. Using the backend's own
balance services (not ad-hoc SQL), compare a representative sample **before vs
after**:

- Capture, _before_ deploying, the output of `GET
/groups/{id}/settlements/balances` for a handful of representative groups
  (store the `balances` array values in the ticket, not in logs).
- _After_ migration, call the same endpoints and confirm each group/person
  balance is **identical**.

Cover at least one of each:

- normal group, household group,
- a group with a refunded expense,
- a group with unequal shares,
- an older group, and a group with 3+ members.

Rationale: for single-payer expenses the backfilled payment equals
`amount_total`, so `computeBalancesCore` produces the same numbers — proven
byte-identical locally. This step confirms it on real data.

**Stop condition:** any balance differs → **stop**.

---

## Step 6 — People API smoke tests

Call (authenticated, against production, results summarised — no PII in the
report):

- `GET /people` — responds 200; totals + up to `limit` people; `direction` /
  `netBalance` correct; `hasMultipleCurrencies` behaves; existing relationships
  look right.
- `GET /people/{userId}` — net + direction + per-currency breakdown + newest-first
  history; group lines carry `groupId` / `groupName` / `expenseId` and
  `encryptionScope` / `groupKeyVersionId` when applicable.
- `GET /groups/{groupId}/settlements/balances` — unchanged vs Step 5.

Confirm: household expenses are **excluded** from People; normal-group expenses
appear; direct entries work; multi-currency is safe (dominant-currency totals).

---

## Step 7 — Production application smoke test

With appropriate test accounts/data on the deployed app:

- **Flow A — Existing group expense:** open an existing normal group + expense →
  renders correctly; group balance unchanged.
- **Flow B — People:** dashboard loads; top-5 behavior; open a person → balance,
  direction, breakdown, history correct.
- **Flow C — Direct transaction:** Lend ₹X → other user owes ₹X.
- **Flow D — Partial settlement:** settle part → remaining balance correct;
  original transaction still in history (not mutated).
- **Flow E — Household:** a household expense does **not** create a People debt.

---

## Step 8 — Frontend deployment

Only after Steps 3–7 pass, deploy the frontend and confirm:

- `/people`, `/people/all`, `/people/:userId` work,
- `/friends` redirects to `/people`,
- People nav visible,
- direct lend/borrow works, settlement works,
- source-expense navigation works,
- **E2EE group-expense titles still decrypt** (reuses `ExpenseDecryptionService`).

---

## Step 9 — Monitoring (first hours/days post-deploy)

Watch:

- `/people` API error rate, settlement errors, expense-creation errors,
- DB/migration errors, frontend People-route errors.

Alert specifically on:

- unexpected balance discrepancies,
- duplicate `ExpensePayment` rows (see §4c),
- missing direct ledger entries,
- **household expenses appearing in People** (should never happen),
- settlement failures.

---

## Step 10 — Rollback strategy (two distinct kinds)

### 10a. Application rollback (the normal mechanism)

If the frontend/backend deployment misbehaves: **roll back the application
deployment** (redeploy the previous build). **Keep the new database tables.** The
old backend is unaffected by the extra tables; the new tables simply go unused.
**Do NOT revert the database migration to roll back the app.**

### 10b. Database migration rollback (exceptional only)

`npm run db:migrate:revert` drops `direct_ledger_entries` and `expense_payments`.
It is technically reversible, but **once production has written new data**
(multi-payer `ExpensePayment` rows, direct ledger entries, settlements) a revert
**deletes those records**. Therefore:

- Do **not** run `db:migrate:revert` as a casual rollback.
- Consider it only under an explicitly-approved recovery procedure, with a fresh
  backup taken first and a documented plan to restore any lost P2P data.

---

## Step 11 — Local development environment (retain)

- Keep `backend/verify-p2p-migration.ts` and `backend/uat-p2p.ts` — regression /
  pre-migration verification harnesses. **Do not delete.**
- They run against the **local** Docker Postgres only (they force
  `DATABASE_URL=localhost`), never production.
- Stop the local database with:

  ```
  npm run db:down
  ```

---

## Step 12 — Final production checklist

Backfill/DB:

- [ ] Production backup confirmed (id + UTC time recorded)
- [ ] Correct Neon production database confirmed (host only)
- [ ] Backend deployed
- [ ] Migration executed (`npm run db:migrate`)
- [ ] `orphan_expenses = 0`
- [ ] payment `sum_mismatches = 0`
- [ ] no unexpected duplicate backfills
- [ ] existing balance parity verified (normal + household + refund + unequal + older + multi-member)

API:

- [ ] `GET /people` verified
- [ ] `GET /people/:userId` verified
- [ ] `GET /groups/:id/settlements/balances` verified
- [ ] household exclusion verified

App smoke:

- [ ] existing expense rendering verified
- [ ] People dashboard verified
- [ ] person detail verified
- [ ] direct lend/borrow verified
- [ ] partial settlement verified
- [ ] full settlement verified
- [ ] source expense navigation verified

Frontend:

- [ ] Frontend deployed
- [ ] `/friends` → `/people` verified
- [ ] E2EE title decryption verified
- [ ] no production errors observed

---

## Step 13 — Stop conditions (halt immediately, do not "fix" prod)

Stop and report (awaiting approval) if any occur:

- wrong `DATABASE_URL` / unidentifiable target,
- backup unavailable,
- migration fails,
- `orphan_expenses > 0`,
- `sum_mismatches > 0`,
- any existing balance changes,
- `/people` returns incorrect data,
- household expenses appear in People,
- frontend/backend API mismatch,
- any unexpected production data change.

Report the **exact** failure (message/counts only — no secrets, no PII) and wait.
