# Person-to-Person (Splitwise-style) Balances — Analysis & Implementation Plan

Status: **BACKEND PHASE 1 IMPLEMENTED (2026-08-11)** — frontend deferred.
Migration written but **not yet run**. Verification: `nx build backend` ✓,
`nx test backend` 515 pass / 34 suites / 0 fail, `nx lint backend` 0 errors.
Date: 2026-08-11

### Decisions taken (2026-08-11)
1. **Multiple payers: implement now** (new `ExpensePayment` table — see §11a).
2. **`/friends`: replace with `/people`**, redirect the old route, fix the
   household leak in cross-person aggregation.
3. **Over-settlement: reject** with a clear validation error.
4. **Delivery: backend read-model first** — entity + service + API + tests, then
   STOP for review before any frontend work.

> ⚠️ Decision 1 (multi-payer) mutates the **core Expense payment model and the
> balance engine** — paths previously marked "must not modify". The concrete
> design and its data-backfill are in **§11a** and require explicit sign-off
> before the migration runs, because it rewrites how every existing expense's
> payer is stored.

This document is the required pre-implementation plan (AGENT_RULES §"Planning and
Approval Rules"). It maps the existing architecture, identifies gaps, and proposes
a minimal, non-conflicting extension.

---

## 1. Current architecture (files inspected)

### Entities (`shared/data-models/src/lib/`)
- `expense.entity.ts` — single payer: `paidByUser` XOR `paidByGroupMember` (CHECK
  constraint). `transactionType: 'expense' | 'refund'`. `group` nullable
  (personal expenses allowed). Soft-delete via `deletedAt`. `encryptionScope:
  personal | group | direct_shared`.
- `expense-split.entity.ts` — one row per participant: `participantUser` XOR
  `participantGroupMember`, `splitType`, `shareValue`, `amountOwed`, `isSettled`,
  soft-delete.
- `group.entity.ts` — `groupType: 'normal' | 'household'`, `currency`,
  `carryForwardEnabled`.
- `group-member.entity.ts` — references a `User` and/or a `Contact`; roles incl.
  `spectator` (never in splits/settlements); `joinStatus`.
- `group-member-contribution.entity.ts` — household **percentage** target per
  member per `ledgerMonth` (NOT a debt).
- `settlement.entity.ts` — **group-scoped** (`group` NOT NULL). `from*/to*` as
  GroupMember (primary) / User (legacy). `status: proposed|confirmed|cancelled`.
  Versioned; history in `settlement-version.entity.ts`.
- `contact.entity.ts` — a real-world person with or without an account; created
  only when someone adds them to a group. No cross-group stable identity until
  claimed.

### Services / controllers
- `backend/src/app/settlements/settlements.service.ts`
  - `computeBalancesCore()` — the canonical balance engine. Per group, keyed by
    `GroupMember.id`: `+amountTotal` to payer, `−amountOwed` to each participant,
    refunds inverted (`sign=-1`), confirmed settlements folded in. Produces
    `balances[]` and `suggestedSettlements[]` (via `simplifyDebts`).
  - `simplifyDebts()` → `simplifyLedgerDebts` (shared `ledger-debt-simplifier`):
    min-cash-flow netting within a single balance graph.
  - `calculateGroupBalances()` — overall vs filtered + caller breakdown.
  - `calculateFriendsBalances()` — **cross-group aggregation**, iterates ALL active
    memberships, sums `suggestedSettlements` per counterparty. **Registered-users
    only** (frozen rule, lines 875–891). **Does NOT exclude household groups.**
  - `proposeSettlement()` / `updateSettlement()` — group-scoped propose→confirm.
- `settlements.controller.ts` — `GET/POST/PATCH /groups/:groupId/settlements`,
  `GET .../balances`.
- `friends.controller.ts` — `GET /friends` → `calculateFriendsBalances`.
- `expenses/expenses.service.ts`
  - `persistSplits()` (l.760) — computes splits via `calculateDeterministicSplits`
    (shared `split-calculator.ts`: equal/fixed/percent/share, **single** payerKey).
    Personal (non-group) expenses **can already carry `participantUser` splits for
    other users** (l.792–824) — a latent foundation, not surfaced in any balance.
  - `createExpense()` (l.874), `updateExpense()` (l.1491, soft-deletes + recreates
    splits), `deleteExpense()` (l.1895, `softRemove`). Balance queries filter
    `status='posted' AND deletedAt IS NULL` → **edits/deletes auto-propagate** to
    balances with no extra bookkeeping.
- `groups/groups.service.ts` — `getContributions/updateContributions` (household
  percentage targets; separate from debts).

### Frontend
- `features/friends/` — `FriendsComponent` + `FriendsService` (`GET /friends`).
  Aggregate cards + expandable per-group breakdown. **No** person detail, **no**
  direct lending, **no** settle-from-here. Registered users only.
- `features/groups/components/balance-cards/` — `group-balances`,
  `balance-carousel`, `suggested-settlements` (display only).
- `shared/layouts/main-layout.component.ts` — nav has Home/Analytics/Groups/
  Settings/Profile; **`/friends` is not linked** in the primary nav today.
- `app.routes.ts` — `friends` lazy route exists.

---

## 2. Existing expense/balance/refund/household logic (verified)

- **Totals/shares**: `calculateDeterministicSplits` — deterministic remainder
  allocation, payer gets rounding priority. Shares are authoritative (fixed/
  percent/share) — never re-equalised. ✅ satisfies §6 (unequal) already.
- **Balance**: net = (paid − owed) per member per currency, then `simplifyDebts`
  → pairwise suggestions. Multiple **participants** with a single payer already
  produce correct "C owes A / C owes B" style results (§7 example matches
  net+simplify). **Multiple payers are NOT supported** (single-payer schema).
- **Refund**: negative expense — payer sign inverted, participant shares inverted.
  Flows through the same balance engine. Do not break.
- **Household**: expenses carry `ledgerMonth`; `GroupMemberContribution` holds
  monthly % targets; carry-forward creates system expenses (`isCarryForward`).
  Household groups currently **do** flow into `calculateGroupBalances` and thus
  into `/friends` — a leak relative to §14/§27.

---

## 3. Gaps relative to the requirement

| # | Requirement | Status today |
|---|---|---|
| G1 | Unified per-person view across groups **+ direct** | Partial: `/friends` is group-only, simplified, registered-only, includes household |
| G2 | Direct lending/borrowing (no group) | **Missing** entity/API/UI |
| G3 | Person detail page + chronological history + source refs | **Missing** |
| G4 | "Return"/settle from the person page (not group-scoped) | **Missing** (settlements are group-scoped) |
| G5 | Household must NOT create P2P debt | **Violated** (household leaks into `/friends`) |
| G6 | Preserve pairwise obligations + source expense (no chain simplification, §25) | `/friends` uses `simplifyDebts` which can reroute A→B→C |
| G7 | Max-5 on dashboard + "View all", ordered by outstanding | **Missing** (friends page shows all) |
| G8 | Multiple payers (§7) | **Missing** (single-payer schema) — see §11 risk |
| G9 | Nav entry for People | **Missing** |

---

## 4. Proposed data model

**Principle:** derive balances; add the *minimum* persistent surface. One new
entity only.

### New entity: `DirectLedgerEntry` (`direct_ledger_entries`)
Represents an explicit, group-less obligation or settlement between two **Users**.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `fromUser` | User (NOT NULL) | debtor side of the movement |
| `toUser` | User (NOT NULL) | creditor side |
| `entryType` | `'lend' \| 'borrow' \| 'settlement'` | UI verb; normalised so direction is unambiguous |
| `amount` | decimal(12,2) > 0 | |
| `currency` | char(3) | |
| `note` | text nullable | |
| `occurredOn` | date | user-facing date (§23) |
| `version` | VersionColumn | optimistic locking |
| `createdAt/updatedAt` | timestamps | |
| `deletedAt` | soft-delete | edit/void without destroying history (§12) |

Direction convention (mirrors `computeBalancesCore`): a `lend`/`borrow` entry adds
`+amount` to `toUser`'s claim on `fromUser`; a `settlement` reduces it. `lend` and
`borrow` are the **same** underlying obligation recorded from opposite viewpoints
(§8) — the service normalises both into `from`/`to` at write time.

**Why a new table, not reuse `Settlement`:** `Settlement.group` is `NOT NULL`, it
carries a propose→confirm workflow, and a CHECK constraint keyed to GroupMember.
Making it group-optional would ripple through every settlement path. A small
dedicated table keeps the group ledger frozen and the direct ledger clean.
(Alternative considered: extend `Settlement` with nullable group + type — rejected
as higher-risk to a frozen, security-sensitive path. See §11.)

**No new balance table.** Current balances stay **derived**. The People view is a
read-model computed on the fly from: normal-group expenses/splits/settlements
(existing engine) + `DirectLedgerEntry` rows. This preserves the "single source of
truth = transactions" rule (§4, §28) and auto-handles edit/delete (§29).

### History reference (§20, §33)
No new join table needed. Each history line already carries its origin:
- group obligation → `Expense.id` (+ group id/name) — link to the expense.
- direct → `DirectLedgerEntry.id` (type lend/borrow/settlement).

---

## 5. Proposed balance/ledger algorithm — `PersonLedgerService` (read-model)

New service `backend/src/app/people/person-ledger.service.ts`.

**A. Group-derived pairwise obligations (per counterparty of the caller):**
For each **normal** group (exclude `groupType='household'`, closing G5) the caller
is an active member of, reuse `computeBalancesCore` to get member net balances, but
extract the **caller's pairwise edges** rather than the global simplified graph, to
honour §25/G6. Two sub-options:

- **A1 (recommended): per-expense decomposition.** For each posted, non-deleted
  expense in the group, for each participant `p ≠ payer`: `p owes payer
  amountOwed(p)` (refund inverts). Aggregate only edges where the caller is one
  side. This yields true pairwise debts, each tagged with its **source expense**
  (needed for §19/§20 history) and never reroutes across people.
- **A2: caller-vs-each-member net.** Simpler but loses per-expense source lines and
  can't answer "which expense caused it".

→ Recommend **A1**: it is the only option that satisfies the "open the source
expense" requirement and the no-chain-simplification rule simultaneously.

**B. Direct obligations:** sum `DirectLedgerEntry` for the caller per counterparty
per currency (`lend`/`borrow` add, `settlement` subtracts, signed by direction).

**C. Net per counterparty per currency:** `net = Σ(they owe caller) − Σ(caller owes
them)`. Positive → "X owes you"; negative → "You owe X". Group settlements
(existing) reduce the group portion; direct settlements reduce the net.

**Outputs:**
- `GET /people` → `[{ counterpartyUserId, displayName, avatar, currency,
  netBalance, direction }]`, sorted by `|netBalance|` desc, settled last (G7).
- `GET /people/:userId` → header net + **breakdown** (group total / direct total /
  settlements) + paginated **history** (each line: amount, direction, type, date,
  note, groupId/groupName, expenseId, entryId).

**Registered-users only (V1)**, consistent with the existing frozen `/friends`
rule — a stable cross-context person identity requires a `User`. Pending Contacts
remain visible inside their group. (Documented, not a bug.)

---

## 6. Proposed API changes

New module `people` (controller + `PersonLedgerService`), all `@UseGuards(JwtAuthGuard)`:

| Method | Route | Purpose |
|---|---|---|
| GET | `/people` | dashboard list (support `?limit=5` for the max-5 widget, full list otherwise) |
| GET | `/people/:userId` | header + breakdown + history (paginated) |
| POST | `/people/:userId/transactions` | create direct lend/borrow (`{ entryType, amount, currency, occurredOn, note }`) |
| POST | `/people/:userId/settlements` | "Return" — creates a `settlement` DirectLedgerEntry |
| PATCH | `/people/transactions/:id` | edit (version-checked) |
| DELETE | `/people/transactions/:id` | soft-delete/void |

New DTOs in `shared/data-models`: `CreateDirectTransactionDto`,
`CreateDirectSettlementDto`, `UpdateDirectTransactionDto`, and response interfaces
`PersonSummaryResponse`, `PersonDetailResponse`, `PersonHistoryItem`.

`/friends` is **kept** (backward compat) but the new `/people` supersedes it for the
UI. Optionally re-point `FriendsController` to the new service later.

---

## 7. Proposed frontend / UX changes

New feature `features/people/` (lazy route `/people`), nav entry added (G9).

- **`people-dashboard` page** (`/people`): "You are owed / You owe" summary cards
  (reuse `stats-card`), top-5 person rows (`Naveen owes you ₹720`), "View all".
- **`people-list` page** (`/people/all`): full list, search (reuse
  `FriendsService.searchUsers` / `/users/search` to start a new relationship).
- **`person-detail` page** (`/people/:userId`): header (`X owes you ₹720` /
  `You owe X`), `[Return]` + `[Add Transaction]`, breakdown, chronological history
  with source-expense links (route to `/groups/:groupId` expense).
- **`add-direct-transaction` modal**: lend/borrow radio, amount, date, note (no
  group selector, §23).
- **`return/settle` modal**: prefilled full outstanding, editable for partial (§22).
- New `PeopleService` (Angular `HttpClient`) under `features/people/services/`.
- State: signals for local UI; RxJS for HTTP (per state strategy). No NGXS needed.
- Reuse `CurrencyPipe`, existing card styles; follow Tailwind-only rule.

The existing `features/friends/` page can be redirected to `/people` (kept as an
alias) once the new pages land.

---

## 8. Migration / backward compatibility

- One new migration: create `direct_ledger_entries` (with FKs to `users`, indexes
  on `(fromUser)`, `(toUser)`, `occurredOn`, partial `deletedAt IS NULL`). **No
  changes to existing tables** → zero backfill, no risk to expenses/settlements.
- Household exclusion (G5) is a **read-side filter** (`groupType='normal'`) in the
  new service; `/friends` behaviour can be left as-is or fixed in the same PR
  (recommend fixing the household leak in `calculateFriendsBalances` too — small,
  but flag as a behaviour change for approval).
- Register entity in `shared/data-models` barrel + backend `TypeOrmModule.forFeature`.

---

## 9. Test plan (Jest, `npx nx test backend` / `frontend`)

**Split/group (reuse existing + new pairwise extraction):** one payer/two users;
equal; unequal (fixed/percent/share); 3+ users; refund full/partial; edit split;
edit payer; edit amount; delete expense → person balance updates; household expense
→ **no** P2P debt; household contribution % unchanged.
**Direct:** lend; borrow; multiple lends; multiple borrows; partial settlement;
full settlement → ₹0; over-settlement rejected/allowed decision (see §11);
settlement preserves original entries (history intact).
**Mixed:** group debt + direct lend; + direct borrow; + settlement; direct +
settlement; same two people across multiple groups nets correctly.
**History/ordering:** chronological order; source group ref; source expense ref;
settlement lines; direct lines.
**Edge:** zero/settled; negative/invalid amount rejected; decimal rounding
(cents); caller as payer+participant; removed/left member; pending Contact
excluded from cross-person view but visible in group.
**Service unit tests are mandatory** for `PersonLedgerService` and `PeopleService`
(AGENT_RULES: new services must have unit tests).

---

## 10. Risks & edge cases / open decisions

1. **Multiple payers (§7, G8).** Current schema is single-payer. Options:
   (a) **V1: keep single payer** — §7's "multiple overpayers" needs the group's
   *net* across several single-payer expenses (still correct via net+pairwise), but
   a *single expense with 2 payers* cannot be entered. (b) Add a `payments` table
   (multi-payer) — larger change. **Recommend (a) for V1**, document the limitation.
   **Decision needed.**
2. **Chain simplification vs `/friends` (G6).** New People view uses per-expense
   pairwise (A1) to preserve source + avoid rerouting. `/friends` keeps
   `simplifyDebts`. Two different answers can coexist; recommend the UI standardise
   on `/people`. **Decision: deprecate `/friends` UI?**
3. **Return semantics when balance mixes group + direct.** A direct `settlement`
   reduces the *net*; it does not touch confirmed group settlements. Risk of double
   counting only if a user *also* confirms a group settlement for the same money.
   Acceptable for V1; document. **Decision needed.**
4. **Over-settlement** (§Edge): return > outstanding → either reject or allow
   (flips direction). Recommend **reject** in V1 with a clear error. **Decision.**
5. **Household leak fix** changes `/friends` output. **Decision: fix in this PR?**
6. Currency: per-currency netting (never cross-currency), matching existing engine.

---

## 11. Files that WILL be modified / created

**Create**
- `shared/data-models/src/lib/direct-ledger-entry.entity.ts`
- `shared/data-models/src/lib/dto/direct-transaction.dto.ts`
- `shared/data-models` barrel + `api-responses.ts` (Person* interfaces)
- `backend/src/app/people/people.module.ts`, `people.controller.ts`,
  `person-ledger.service.ts` (+ `.spec.ts`)
- `backend/src/migrations/<ts>-AddDirectLedgerEntries.ts`
- `frontend/src/app/features/people/` (routes, pages, `people.service.ts` + specs)

**Modify**
- `backend/src/app/app.module.ts` (register `PeopleModule`)
- `shared/data-models` entity index + TypeORM entity list / `ormconfig`
- `frontend/src/app/app.routes.ts` (+ `/people`)
- `frontend/src/app/shared/layouts/main-layout.component.ts` (nav entry)
- (optional) `settlements.service.ts` `calculateFriendsBalances` household filter
- `FinMate_Project_Specification.md` progress log; `DATABASE_SCHEMA.md`,
  `API_SPECIFICATION.md`, `openapi.yaml` (new entity/endpoints)

**Must NOT modify (reuse only)**
- `expense.entity.ts`, `expense-split.entity.ts`, `settlement.entity.ts` and the
  group settlement propose/confirm flow.
- `split-calculator.ts`, `ledger-debt-simplifier`, `computeBalancesCore` internals
  (call, don't change).
- Household contribution logic (`getContributions/updateContributions`,
  carry-forward). Encryption/key-provisioning paths.

---

## 11a. Multi-payer design (Decision 1 — needs sign-off before migration)

**New entity `ExpensePayment` (`expense_payments`)** — one row per payer of an expense.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `expense` | Expense (NOT NULL, onDelete CASCADE) | |
| `paidByUser` | User nullable | XOR with `paidByGroupMember` (CHECK) |
| `paidByGroupMember` | GroupMember nullable | group expenses; frozen group-identity rule |
| `amount` | decimal(12,2) > 0 | |
| `version` / timestamps / `deletedAt` | | mirrors split lifecycle |

**Invariant:** `Σ payments.amount == expense.amountTotal` (validated on create/update,
same cents math as the split calculator).

**Source-of-truth switch:**
- `ExpensePayment` becomes authoritative for "who paid".
- `Expense.paidByUser/paidByGroupMember` are **kept** and continue to hold the
  *primary* payer (payments[0]) for backward compatibility, existing reads, the
  CHECK constraint, and single-payer UX. New code reads payments; legacy columns
  stay consistent.

**Balance engine change (`computeBalancesCore`):** replace the single "add
`amountTotal` to payer" step with "add each `payment.amount` to that payment's
member" (refund sign preserved). Splits/participants loop is unchanged. This is
the one edit to the otherwise-frozen engine.

**Create/Update expense:** accept optional `payments: [{ paidByUserId |
paidByGroupMemberId, amount }]`. When omitted → single payment derived from the
existing `paidBy*` (100% backward compatible). `persistSplits` still takes a single
`payerKey` for rounding priority → use the **largest** payment's member as the
rounding-priority key (deterministic tie-break by member id).

**Migration & backfill (the risky part):**
1. Create `expense_payments` (indexes on `expense`, `paidByUser`,
   `paidByGroupMember`; partial `deletedAt IS NULL`).
2. **Backfill:** for every existing non-deleted `expenses` row, insert one
   `ExpensePayment` = (its `paidBy*`, `amountTotal`). Idempotent, additive; no
   existing column dropped or rewritten. Reversible by dropping the table.
3. `down()` drops the table only.

**Scope impact of Decision 1** (beyond the People feature): `expense.entity.ts`,
`expenses.service.ts` (create/update/read DTO), `CreateExpenseDto`/`UpdateExpenseDto`,
`computeBalancesCore`, `openapi.yaml`, `DATABASE_SCHEMA.md`, plus new
`ExpensePayment` entity + backfill migration + tests. **This is a bigger blast
radius than the direct-ledger work** and is why it needs its own sign-off.

> Open sub-question for you: OK to **backfill one payment row per existing
> expense** (additive, reversible), and to have `computeBalancesCore` read
> payments instead of `expense.paidBy*`? This is the only step that rewrites core
> financial read paths.

## 12. Step-by-step implementation order (after approval)

**Backend-only scope (Decision 4 — stop before frontend):**
1. **Multi-payer core (§11a):** `ExpensePayment` entity + backfill migration;
   `computeBalancesCore` reads payments; create/update expense accept `payments[]`
   (back-compatible); DTO changes. Tests. *(gated on §11a sign-off)*
2. `DirectLedgerEntry` entity + DTOs + shared barrel; migration.
3. `PersonLedgerService`: direct-entry CRUD (lend/borrow/settle, reject
   over-settlement) + read-model (group per-expense pairwise A1 + direct + net),
   **household excluded**. Unit tests (mandatory).
4. `PeopleController` + `PeopleModule` wiring; `openapi.yaml` / API docs.
5. Household-leak fix in `calculateFriendsBalances`; keep `/friends` API until the
   frontend redirect lands.
6. Verify `npx nx test backend`; update progress log + `DATABASE_SCHEMA.md` /
   `API_SPECIFICATION.md`. **STOP for review — frontend deferred to a later phase.**

**Deferred (frontend phase, after backend review):** `features/people/` pages,
`PeopleService`, nav entry, `/friends`→`/people` redirect.

---

**STOP — awaiting §11a multi-payer sign-off before writing the migration/code.**
