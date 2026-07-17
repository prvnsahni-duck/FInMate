# FinMate v2 — Final Zero-Knowledge Architecture Sign-off (Post G-ROT)

> **Date:** 2026-07-17 · **Branch:** `Expense-module0a`
> **Method:** evidence-only; every conclusion cites file · method · line, verified first-hand this session.
> **Companions:** [expense-module-release-signoff.md](expense-module-release-signoff.md), [expense-module-architecture-verification.md](expense-module-architecture-verification.md)

## 0. Canonical-source status (governs the whole report)

All 16 ADR files (`ADR-000.md`–`ADR-015.md`), `ARCHITECTURE-PRINCIPLES.md`, and `NON-GOALS.md` in
[docs/architecture/adr/](../architecture/adr/) are **explicit placeholders** ("STATUS: PLACEHOLDER — NOT YET
IMPORTED", with an instruction *not* to author/infer/reconstruct their content). Per those placeholders, the
working sources of truth are `docs/frozen-decisions.md`, `docs/PROJECT_DECISIONS.md`, and `ARCHITECTURE.md`.

**Direct conflict found:** the sign-off brief's ADR-003 expectation (category names + expenseDate encrypted;
server stores opaque CategoryUUID only) **contradicts** `docs/frozen-decisions.md:12`:

> "**Amounts remain plaintext.** `amount_total`, `currency`, `category`, `expense_date` are plaintext columns —
> this is intentional and enables server-side aggregation."

Both readings are reported below (G-CAT / G-DATE). This conflict itself is a sign-off blocker: the repo cannot
be certified against "frozen v2 ADRs" that are not in the repo, and the in-repo frozen decision says the
opposite of the brief. **Resolution requires importing the real ADR-003 text.**

---

## 1. Architecture compliance score

| Reference frame | Score |
|---|---|
| vs. in-repo canon (`frozen-decisions.md`) | **~80%** — data-model/ledger/lifecycle rules hold; rotation lifecycle violates frozen-decisions:16 ("Encrypted resources reference the key version used" — untrue on the write/update paths, see §11) |
| vs. the brief's ADR-003 field classification | **~55%** — category, expenseDate plaintext; no CategoryUUID; no SequenceNumber; merchant/notes/receipts/OCR/AI fields absent |

## 2. G-ROT verification — **PARTIAL** (endpoint fix PASS · rotation lifecycle FAIL)

### 2.1 Endpoint fix (this branch) — PASS on all checklist items

| Check | Evidence | Result |
|---|---|---|
| `GET /groups/:id/keys/me?versionId=` supported | `groups.controller.ts:343-353` (`ParseUUIDPipe({optional:true})`) → `groups-membership.service.ts:84-86` → `groups.service.ts:1258` | ✅ |
| Historical (SUPERSEDED) versions served | `groups.service.ts:1262-1271` — lookup by `{id, group}` with no status filter except REVOKED | ✅ |
| Active fallback unchanged | `groups.service.ts:1272` → `getActiveGroupKeyVersion` (`:86-90`, `status:'ACTIVE'`) | ✅ |
| Cross-group versionId rejected | scoped `findOne({id, group:{id:groupId}})` → `NotFoundException`; spec "reject a versionId that does not belong to the group" | ✅ |
| REVOKED rejected | `keyVersion.status === 'REVOKED'` → `NotFoundException`; spec covers it | ✅ |
| FE requests version-aware keys | `expense-decryption.service.ts:165-169` passes `expense.groupKeyVersionId` → `group-key.service.ts:83-95` → `?versionId=` appended `:493-495` | ✅ |
| Key cache stores by version | `buildVersionedKey` = `` `${groupId}:${versionId ?? 'active'}` `` `group-key.service.ts:43-45`; memory `:29,:503,:529-530`; IndexedDB `zk-key-vault.service.ts:227-228` (`group:` prefix) | ✅ |
| Membership still enforced | `getActiveMembership` first line `groups.service.ts:1259` | ✅ |
| Tests | 4 new specs in `groups.service.spec.ts` (`getMyGroupKey` block); backend suite 250/250 green; `nx build backend` clean | ✅ |

### 2.2 Scenario verification (architecture level)

| Scenario | Result | Why (evidence) |
|---|---|---|
| **S1** member present pre-rotation; rotate; logout/login; both expenses decrypt | ✅ PASS* | Member holds a `MemberWrappedGroupKey` per version (created when each version was active — invite `groups.service.ts:568-585`, provision `:1201-1256`, rotate `:1389-1396`). Decrypt requests the stamped version per expense; logout wipes vault (`auth.state.ts:145-148`, `zk-key-vault.service.ts:198-224`) but re-fetch of superseded versions is unblocked (`group-key.service.ts:493-495`). *Conditional on the rotation call having wrapped the new key for this member (`rotateGroupKey` wraps only what `dto.keys` supplies). |
| **S2** fresh install → bootstrap → sync → all decrypt | ✅ PASS* | Same chain; bootstrap (`crypto-bootstrap.service.ts:38-55`) restricts nothing; keys fetched on demand per stamped version. |
| **S3** join after rotation → historical expenses decrypt | ❌ **NO MECHANISM** | All three `MemberWrappedGroupKey` creation sites are ACTIVE-only (`groups.service.ts:568-585`, `:1201-1256` via `ensureActiveGroupKeyVersion:1216`, `:1389-1396`). `getMissingGroupKeys` inspects the active version only (`:1305-1330`). `joinGroupByToken` persists **no** key rows (`:1054-1156`) and echoes the invite's wrapped key, which may reference a now-SUPERSEDED version (`:1078-1080,:1149-1155`; rotation never updates `GroupInvite`). No endpoint lists a group's key versions. Whether new members *should* see history is **REQUIRES ADR CONFIRMATION** (NON-GOALS.md is a placeholder) — but even if intended, no server path can provision it. |
| **S4** rotations v1→v2→v3→v4, all history decryptable | ✅ PASS* for members wrapped at every rotation; degrades to S3 for anyone missed by a `dto.keys` list (no repair path for old versions). |

### 2.3 NEW rotation-lifecycle defects (found this audit)

| ID | Defect | Evidence | Severity |
|---|---|---|---|
| **G-ROT-W1** | **Write path can silently corrupt the version stamp.** FE encrypts with the cached `'active'`-alias key (`features/groups/services/expenses.service.ts:55`; `create-expense-modal.component.ts:421-426`); nothing invalidates that alias on rotation (invalidators are only manual refresh `group-detail.component.ts:421` / logout `auth.state.ts:148`); the create/update DTOs carry **no** `groupKeyVersionId` (`shared/data-models/src/lib/dto/expense.dto.ts:77-206`); the backend stamps the **current ACTIVE** version regardless (`expenses.service.ts:632-649`). ⇒ After a rotation, any client with a warm cache creates expenses whose ciphertext used v_old but whose stamp says v_new → **permanently undecryptable** ("Unable to display this item") for everyone, including the author after logout. | Critical |
| **G-ROT-U1** (sharpened G-KV) | **Update never re-stamps.** `updateExpense` re-encrypts client-side with the active-alias key, but the stamp is only set when null (`expenses.service.ts:987-992`). Post-rotation edit ⇒ ciphertext v_new, stamp v_old → undecryptable. | Critical |
| **G-ROT-F1** | **No frontend rotation flow exists at all.** Repo-wide, `/keys/rotate` is referenced only in the backend (`groups.controller.ts:325`, `groups.service.ts:1332`). Rotation is API-only; no UI re-wraps keys, no client invalidation signal exists. | High |
| **G-ROT-I1** | Invites created pre-rotation hand joiners a stale superseded-version key for a group whose live content is on the new version (`groups.service.ts:1078-1080`); recovery depends on an admin provisioning the active key (`:1219-1220` self-provision requires key material the joiner lacks). | High |

**Bottom line for Phase 1:** the G-ROT *read path* is fixed and verified. The rotation *lifecycle* still cannot be
exercised safely end-to-end: rotating a key with any online client, or editing an old expense after rotation,
produces undecryptable records — a violation of the repo's own frozen-decisions:16.

## 3. G-CAT verification — **FAIL vs. brief ADR-003 · INTENTIONAL per frozen-decisions:12**

Server stores the **plaintext category name**, not an opaque UUID. There is no CategoryUUID anywhere.

Affected surface (complete):
- **Schema/entity:** `expense.entity.ts:40-41` `varchar(64)`; composite index `:18 @Index(['group','category'])`. `recurring-expense.entity.ts:32` (plaintext, "Plaintext" comment).
- **DTO:** `backend/src/app/expenses/dto/create-expense.dto.ts:58-62` — `@IsString/@IsNotEmpty/@MaxLength(64)`, no `@IsCiphertext`.
- **Endpoints:** list filter `expenses.controller.ts:51,67` + `expenses.service.ts:794-796` (`WHERE expense.category = :category`); category-distribution analytics `expenses.controller.ts:165` → `expenses.service.ts:1363-1399` (SQL selects raw category); combined monthly analytics `:1852-1933` (`:1897-1930` groups by plaintext category); create/update passthrough `:642`, `:954`.
- **Frontend:** sends plaintext category in create/update payloads (`create-expense-modal.component.ts:522-535`); never encrypts it (`features/groups/services/expenses.service.ts:76-88` encrypts title/description only).
- **Migration required (if ADR-003 as briefed):** new opaque `category_id` UUID column + encrypted category-name map (per-scope), backfill, drop `@Index(['group','category'])`, drop plaintext column; move category filtering + distribution analytics client-side (server can still aggregate by opaque UUID); FE category picker becomes an encrypted user/group dictionary. **Complexity: High** (schema + both pipelines + 3 analytics endpoints + sync of the category dictionary). **Release impact:** all server-side category analytics change contract.

## 4. G-DATE verification — **FAIL vs. brief ADR-003 · INTENTIONAL per frozen-decisions:12**

`expenseDate` is server-visible and load-bearing:
- **Schema/entity:** `expense.entity.ts:55-56` `@Column({type:'date'})`; index `:17`. `createdAt` exists and is server-generated (`:87-88`) ✅.
- **DTO:** `create-expense.dto.ts:71-76` — regex + `@IsDateString` (server validates the plaintext date).
- **Backend reads:** range filters `expenses.service.ts:805-811,:1428-1431`; sort `:821 orderBy(expenseDate DESC)`; monthly/yearly aggregation `:1294-1342`; ledger-month logic `:646-653,:1864-1888`; household carry-forward `:1774`.
- **Frontend:** sends plaintext `expenseDate`; reports/filters rely on server queries above.
- **If ADR-003 as briefed:** encrypt expenseDate; keep `createdAt` for sync ordering only; move date filtering/sorting/monthly aggregation client-side or to a blind-index scheme (frozen-decisions:53 sanctions blind index only). Touches: entity + migration, DTO, `getExpenses` sort/filter, 4 analytics methods, household `ledgerMonth` close cycle (currently derived from expenseDate server-side `:653` — would need client-supplied opaque month or redesign), cursor pagination. **Complexity: High.** **Release impact:** severe — the household month-close feature depends on server-visible dates.

## 5. Expense architecture review — PASS (in-repo canon)

- Single authoritative row per expense; personal dashboard **joins**, never copies: `getCombinedMonthlyAnalytics` `expenses.service.ts:1852-1933` (personal query `:1857-1868` + splits join `:1871-1893`); conforms to frozen-decisions:22.
- Optimistic locking `expense.entity.ts:84-85`; soft delete + restore `:93-94`, `deleteExpense:1107`, `restoreExpense:1154`.
- History is audit-only: `writeAuditLog` `expenses.service.ts:240`; no balance path reads it.
- ⚠️ Household `isCarryForward` rows (`expense.entity.ts:72-73`, created `expenses.service.ts:1770-1774`) are system-generated *derived* expense rows — a deliberate ledger device, but note they materialize derived state into the source-of-truth table.

## 6. ExpenseShare (ExpenseSplit) review — PASS with one High defect

- Allocation-only projection, no encrypted content, no duplicated financials: `expense-split.entity.ts:31-48`.
- Balances derive from splits + settlements live: `settlements.service.ts:169` (`calculateGroupBalances`; splits `:272`, settlements `:217-287`); no stored balance (frozen-decisions:52 ✅).
- ❌ **G-SETTLE (High, pre-existing):** edits rebuild splits destructively with `isSettled:false` (`persistSplits` `expenses.service.ts:477,:520` via `updateExpense:863`) — settled state silently lost.
- Splits lack `@VersionColumn`/`@DeleteDateColumn` (G-SPLIT, Medium).

## 7. Encryption review

- ✅ `title`/`description` ciphertext-enforced at the boundary: `@IsCiphertext` `create-expense.dto.ts:26,:36`; backend never decrypts (frozen-decisions:11).
- ✅ Key recovery chain device-portable (verified previously; unchanged): master key `encryption.service.ts:59`; wrapped private key `users.service.ts:154-175` → `group-key.service.ts:366-412`; group keys re-unwrapped `:466,:524`.
- ✅ Group content encrypted directly with the group DEK (`features/groups/services/expenses.service.ts:55`) — per-expense DEK tier absent (REQUIRES ADR CONFIRMATION).
- ❌ No payload signing anywhere (G-SIGN, High) — grep: only a spec fixture.
- ❌ merchant / notes / receipts / OCR / AI metadata fields **do not exist** in `Expense` or DTOs (grep: zero hits) — cannot violate or satisfy encryption rules; absent (REQUIRES ADR for v2 scope).
- ⚠️ Attachments are client-side encrypted correctly (per-file key, wrapped: `create-expense-modal.component.ts:459-476`) but stored in **`localStorage` under `sim_storage:`** (`:466-467`) — simulated storage, not shippable (G-ATT, Medium/High for release).

## 8. Personal expense review — PASS

Personal = `group` null (`expense.entity.ts:49-50`), `encryptionScope:'personal'` (`:81-82`), encrypted with the master/UDK key (frozen-decisions:13). Group expense = Expense + ExpenseSplit. Personal dashboard = personal expenses + **only the caller's** splits (`expenses.service.ts:1871-1893` filters `split.participantUserId = :userId`). No duplicate source of truth found.

## 9. Search review — PASS (by absence)

No server-side expense search endpoint exists (only `/users/search`, `users.controller.ts:42`). No ZK-field plaintext is sent for search (frozen-decisions:53 ✅). Server-side category/date *filters* exist (`expenses.controller.ts:51`, service `:794-811`) — compliant only because those fields are plaintext by frozen-decision; under the brief's ADR-003 they would violate it. No local FTS index exists (REQUIRES ADR).

## 10. Projection review — PASS (by absence)

No projection/materialized-view layer exists; balances are always computed live (`settlements.service.ts:169`), so every derived view is disposable by construction. A dedicated projection store is REQUIRES ADR CONFIRMATION. Exception noted in §5: household carry-forward rows.

## 11. Key management review

Sound: per-version wrapped keys (`member-wrapped-group-key` unique per user×version), immutable version history (`group-key-version.entity.ts:27-28`), version-aware read path end-to-end (this branch), REVOKED refused.
Unsound: everything in §2.3 — the *write* side of frozen-decisions:16 is not honored (client never reports which version it used; server assumes ACTIVE; caches never invalidated on rotation; no FE rotation flow; no historical provisioning; no version-list endpoint; `RecurringExpense` has **no key-version column at all** (`recurring-expense.entity.ts:16-67`) while carrying encrypted `title`/`description` — post-rotation templates decrypt with the wrong (active) key.

## 12. Remaining ADR violations

Cannot be enumerated against real ADRs — **all ADR files are unimported placeholders** (§0). Violations of the in-repo canon: frozen-decisions:16 (§2.3, §11). Conflicts *between* the brief and the canon: G-CAT, G-DATE (§3–4). Everything scope-dependent (projections, FTS, offline sync, per-expense DEK, attachments storage, merchant/notes/OCR/AI, `direct_shared`) is REQUIRES ADR CONFIRMATION.

## 13. Release blockers

**Critical**
1. **G-ROT-W1** — post-rotation stale-cache writes stamp the wrong key version → permanent data loss (§2.3).
2. **G-ROT-U1** — post-rotation edits re-encrypt but never re-stamp → permanent data loss (§2.3).
3. **ADR import** — sign-off against "frozen v2 ADRs" is impossible while ADR-003 et al. are placeholders and the brief contradicts frozen-decisions:12 (G-CAT/G-DATE fork).

**High**
4. **S3 / G-ROT-I1** — no mechanism to give post-rotation joiners historical key versions; stale invite keys (§2.2–2.3).
5. **G-SETTLE** — destructive split rebuild silently clears `isSettled` (§6).
6. **G-SIGN** — no payload signing / tamper evidence (§7).
7. **G-ATT** — attachment storage is `localStorage` simulation (§7) — feature cannot ship as-is.

**Medium**
8. **G-REC** — `RecurringExpense` lacks key-version stamping (§11).
9. **G-SPLIT** — splits lack version/soft-delete (§6).
10. **G-PAGE** — cursor key (`id`) ≠ sort key (`expenseDate`) in `getExpenses` (`expenses.service.ts:821` vs cursor `id < :cursor`).
11. **SequenceNumber absent** — brief expects it for sync; no such column or delta/idempotency machinery exists (REQUIRES ADR for offline-sync scope).
12. **No key-version list endpoint** — clients cannot enumerate versions (only per-expense stamps make S1/S2 work).

**Low**
13. Dead `direct_shared` scope (`expense.entity.ts:81-82`).
14. Household carry-forward materializes derived rows into `expenses` (§5).

## 14. Exact files requiring changes

| # | File | Class · method | Reason | Reference |
|---|---|---|---|---|
| 1 | `shared/data-models/src/lib/dto/expense.dto.ts` | `CreateExpenseDto` / `UpdateExpenseDto` | add `groupKeyVersionId` so the client declares the key it actually used | frozen-decisions:16; G-ROT-W1/U1 |
| 2 | `backend/src/app/expenses/expenses.service.ts` | `ExpensesService.createExpense` (:632-649) | stamp the client-declared version (validated against the group), not blindly ACTIVE | G-ROT-W1 |
| 3 | `backend/src/app/expenses/expenses.service.ts` | `ExpensesService.updateExpense` (:987-992) | re-stamp on every re-encrypting update, not only when null | G-ROT-U1 |
| 4 | `frontend/src/app/features/groups/services/expenses.service.ts` | `encryptPayload` (:36-93) | resolve the concrete active version id (not `'active'` alias), send it in the DTO | G-ROT-W1 |
| 5 | `frontend/src/app/core/services/group-key.service.ts` | `GroupKeyService` (:43-45, :151-187) | invalidate/refresh `'active'` alias on rotation signal; return concrete version with every resolve | G-ROT-W1/F1 |
| 6 | `frontend/src/app/features/groups/components/create-expense-modal/create-expense-modal.component.ts` | payload assembly (:421-426, :522-542) | include `groupKeyVersionId` | G-ROT-W1 |
| 7 | `backend/src/app/groups/groups.service.ts` | `provisionGroupKeys` (:1201-1256), `getMissingGroupKeys` (:1305-1330) | accept a target `versionId` (incl. SUPERSEDED) / report missing keys per version — enables S3 if the ADR intends it | S3, G-ROT-I1 |
| 8 | `backend/src/app/groups/groups.controller.ts` | new `GET :id/keys/versions` | version enumeration for provisioning UIs | §11 |
| 9 | `shared/data-models/src/lib/recurring-expense.entity.ts` | `RecurringExpense` | add `groupKeyVersion` relation + migration | G-REC |
| 10 | `backend/src/app/expenses/expenses.service.ts` | `persistSplits` (:424,:477,:520) / `updateExpense` (:863) | preserve or reconcile `isSettled` on edit | G-SETTLE |
| 11 | `shared/data-models/src/lib/expense.entity.ts` + migration | `Expense.category`, `Expense.expenseDate` | **only if ADR-003 (as briefed) is imported**: opaque CategoryUUID + encrypted date | §3–4 |
| 12 | `docs/architecture/adr/ADR-*.md`, `NON-GOALS.md` | — | import canonical content; resolves the G-CAT/G-DATE fork and all REQUIRES-ADR items | §0 |

## 15. Final verdict

# 🔴 Not ready for v2 release

Reasons, in order: (1) two Critical key-management defects (G-ROT-W1, G-ROT-U1) mean a shipped rotation can
still silently produce permanently undecryptable records — failing the "no key-management error ever" bar and
the repo's own frozen-decisions:16; (2) the canonical ADRs this sign-off must certify against are unimported
placeholders, and the brief's ADR-003 contradicts the in-repo frozen decision on category/date plaintext —
final sign-off is not grantable until that fork is resolved by importing the real ADR text; (3) High-severity
gaps (S3 historical provisioning, G-SETTLE, G-SIGN, simulated attachment storage) remain.

**What G-ROT did achieve:** the version-aware read path is now correct end-to-end (backend endpoint + FE
request/caching + tests), and Scenarios 1, 2, and 4 pass for members provisioned at each rotation.

---

# Addendum (2026-07-17, same day) — Blocker-resolution pass

A verification-then-fix pass re-validated every Critical/High finding above against the implementation
(all CONFIRMED; none were false positives) and resolved the two Critical write-path defects.

## A1. G-ROT-W1 / G-ROT-U1 — RESOLVED

The client now declares the key version its ciphertext was produced with, and the backend stores exactly
that version (rejecting foreign/unknown/revoked ids). A stale cached key no longer corrupts the stamp —
the (key, versionId) pair travels together, so even encrypting with a superseded key yields a correct,
decryptable record.

- `CreateExpenseDto` / `UpdateExpenseDto` (backend + shared): optional `groupKeyVersionId` (`@IsUUID`, optional).
- `ExpensesService.resolveDeclaredGroupKeyVersion` (new): resolves the declared version scoped to the group;
  rejects missing/foreign/REVOKED with `VAL_INVALID_INPUT`. Used by `createExpense` (declared version wins
  over ACTIVE) and `updateExpense` (declared version re-stamps; legacy null-stamp fallback preserved).
  Personal expenses reject a declared version on both paths.
- `GroupKeyService` (FE): `GroupKeyResult.ready` now carries `versionId`; the concrete ACTIVE version id per
  group is recorded on every unversioned backend resolve and after `createGroupKey` (which now confirms the
  minted version via `GET keys/me`); new `getGroupKeyForEncryption()` returns a consistent `{key, versionId}`
  pair (forcing a backend resolve when the version for a vault-restored `'active'` alias is unknown);
  version map cleared in `clearCache`/`invalidateGroupKey`/`refreshGroupKey`.
- `features/groups/services/expenses.service.ts` `encryptPayload`: declares `groupKeyVersionId` on every
  group-scope create/update.
- Tests: 6 new backend specs (stamp-declared incl. superseded, foreign/revoked/personal rejections on create
  and update, re-stamp on update) and 1 new FE spec (POST body carries `groupKeyVersionId`; group key used).
  Backend 256/256, frontend 182/182, both builds green.

Residual (unchanged severity): the create-expense modal's *attachment* pipeline still resolves its scope key
independently (`create-expense-modal.component.ts:421-426`) — irrelevant while attachments are simulated
(G-ATT), but must adopt the same declared-version pair when real storage lands.

## A2. Historical key access for post-rotation joiners (Phase 4) — DECISION REQUIRED, DOCUMENTED

Current supported behaviour (**de-facto Option B — denied**): every wrapped-key creation path targets the
ACTIVE version only, `getMissingGroupKeys` audits only ACTIVE, and no endpoint can provision a SUPERSEDED
version (§2.2 S3). A member joining after rotation N can decrypt only content stamped ≥ N.

No in-repo decision document states this is intended. Evidence *leaning* Option A (history should be
shared): pre-versioning, joining a group meant receiving THE group key, which decrypted all history
(frozen-decisions:15 "Invites wrap the existing key"); versioning was introduced for rotation bookkeeping
(frozen-decisions:16), not as an access boundary; and the data model (`member_wrapped_group_keys` =
per-user **per-version**) already supports historical provisioning without redesign. Recommendation:
Option A, implemented as version-targeted provisioning (§14 items 7–8) — but this is a **product/ADR
decision**; NON-GOALS.md is an unimported placeholder, so it is not implemented here.

## A3. Updated blocker list

- ~~Critical: G-ROT-W1, G-ROT-U1~~ → **resolved** (this pass).
- **Critical (governance):** ADR import (unchanged — G-CAT/G-DATE fork unresolvable from repo contents).
- **High:** S3/G-ROT-I1 historical provisioning (blocked on A2 decision), G-SETTLE, G-SIGN, G-ATT.
- **Medium/Low:** unchanged (§13 items 8–14).

Verdict after this pass: **🔴 blocked pending architecture decision** — no longer by key-management
data-loss defects, but by governance: the canonical ADRs remain unimported and two High items (S3 policy,
G-SETTLE semantics) need product decisions the repo does not record.
