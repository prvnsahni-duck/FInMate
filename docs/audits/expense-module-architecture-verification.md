# Expense Module — Master Architecture Verification (Evidence-Only, Pre-ADR)

> **Status: provisional.** Canonical ADRs (`finmate-v2-adr.md`, `finmate-v2-non-goals.md`) are **not present** in the repo — [docs/architecture/adr/](../architecture/adr/) holds only empty placeholders. Per the audit rules: missing ADRs are stated, the audit continues on code evidence, and nothing is called an "ADR violation." Findings whose correctness depends on an ADR are tagged **REQUIRES ADR CONFIRMATION**.
>
> Every conclusion below is backed by a first-hand code reference (file · class/method · line). Categories: **VERIFIED IMPLEMENTATION**, **VERIFIED GAP**, **REQUIRES ADR CONFIRMATION**, **FUTURE ARCHITECTURE CANDIDATE**.

## 1. Executive Summary

Expense is a real encrypted source of truth for **title/description**; balances are computed live from **splits + settlements** (no stored/duplicated balance); cross-member decryption and logout/login key restoration work for the ACTIVE key version. Verified, ADR-independent gaps: **category and expenseDate are server-visible plaintext**, **no payload signing**, **the backend key endpoint ignores the requested version** (rotation breaks historical access after logout / for new members), splits are **rebuilt destructively** (settled state silently lost on edit), and the recurring template carries **no key version**. Projection, local/FTS search, offline sync, and real attachment storage are **absent** but are **REQUIRES ADR CONFIRMATION**, not gaps, because no ADR defines them as in-scope for v2.

## 2–3. Verified Architecture / Implementation (VERIFIED IMPLEMENTATION)

| Behavior | File · method · line |
|---|---|
| `title`/`description` stored as ciphertext, never decrypted server-side | `shared/data-models/src/lib/expense.entity.ts` `Expense` :24-28; enforced `backend/src/app/expenses/dto/create-expense.dto.ts` `@IsCiphertext` :26,:36 |
| Authoritative amount, plaintext | `expense.entity.ts` :30-35 `amount_total` |
| Expense-level optimistic version | `expense.entity.ts` `@VersionColumn` :84-85 |
| Group key version stamped at create | `backend/src/app/expenses/expenses.service.ts` `createExpense` :529, stamp :632-649 |
| Soft delete + restore | `deleteExpense` :1107 (via `deletedAt` `entity:93-94`), `restoreExpense` :1154 |
| History = audit only | `writeAuditLog` `expenses.service.ts:240`; no balance path reads audit log |
| Balances from splits + settlements | `backend/src/app/settlements/settlements.service.ts` `calculateGroupBalances` :169 → `split.amountOwed` :272 + settlements :217-287 |
| Personal dashboard references shares (no duplication) | `expenses.service.ts` `getCombinedMonthlyAnalytics` :1852-1933 (joins `expense_splits`) |
| ExpenseSplit = allocation only, no encrypted content | `shared/data-models/src/lib/expense-split.entity.ts` `ExpenseSplit` :31-48 |
| Cross-member key provisioning | `backend/src/app/groups/groups.service.ts` wraps existing key, stores `MemberWrappedGroupKey` :557-599,:1003,:1066 |
| Client resolves group key by id | `frontend/src/app/core/services/group-key.service.ts` `resolveGroupKey` :83, `getGroupDataKey` :109, `fetchAndCacheGroupKey` :466 |
| Scope-aware decryption | `frontend/src/app/core/services/expense-decryption.service.ts` `resolveKey` :158, group branch :165-166 |
| Group content encrypted **directly** with the group data key (DEK) | `frontend/src/app/features/groups/services/expenses.service.ts` `getGroupDataKey(groupId)` :55 |
| Logout wipes master key + group vault | `frontend/src/app/core/auth/auth.state.ts` `logout` :139, `clearKey` :146, `clearPersistentCache` :148; `zk-key-vault.service.ts` `clearAll` :198 |
| Login re-derives / re-fetches keys | `frontend/src/app/core/services/crypto-bootstrap.service.ts` `bootstrapUserKeys` :38, `loadKeyFromSession` :43 |

## 4. Verified Gaps (VERIFIED GAP — code-provable, ADR-independent)

| # | Gap | Evidence | Severity |
|---|---|---|---|
| G1 | Category server-visible **plaintext** (indexed) | `expense.entity.ts` :40-41 `varchar(64)`, index :18; DTO :60-62 no cipher | Critical |
| G2 | ExpenseDate **plaintext** (server validates) | `expense.entity.ts` :55-56 `date`, index :17; DTO `@IsDateString` :75 | Critical |
| G3 | No payload **signing** anywhere | grep `sign/signature` → only a `.spec.ts` fixture | High |
| G4 | Backend **ignores requested key version** | client sends `?versionId=` `group-key.service.ts:494-495`; backend `getMyGroupKey` serves ACTIVE only `groups.service.ts:1261-1291` | High |
| G5 | Edit **destroys settled state** | `updateExpense` :863 deletes splits → `persistSplits` recreates `isSettled:false` :477,:520; no adjustment | High |
| G6 | Splits: **no version, no soft-delete** | `expense-split.entity.ts` — no `@VersionColumn`/`@DeleteDateColumn` | Medium |
| G7 | `groupKeyVersion` not refreshed on update | `expenses.service.ts` :987-988 (only if missing) | Medium |
| G8 | Recurring template has **no key version** | `shared/data-models/src/lib/recurring-expense.entity.ts` (no `GroupKeyVersion`) | Medium |
| G9 | Cursor pagination key ≠ sort key | `id < :cursor` vs `expenseDate` sort (search-projection audit) | Medium |
| G10 | Attachments **simulated** in `localStorage` | attachments audit (`sim_storage:`), no endpoints/storage | Medium |
| G11 | Dead `direct_shared` scope | declared `expense.entity.ts:81-82`, validator-rejected | Low |

## 5. Requires ADR Confirmation (cannot classify without ADR — no guessing)

- **Projection layer** — none exists (grep `projection/read-model/materialized` empty). Required for v2 or deferred?
- **Search (SQLite/FTS/local/incremental/rebuild)** — none (grep empty); only server list on plaintext + client decrypt.
- **Offline sync** (create/edit/delete, sequence, idempotency, tombstones, snapshot, delta) — none (grep empty). Only optimistic-lock conflict handling exists (online).
- **Real attachment storage / chunking / resumable / thumbnails / OCR** — none.
- **Encrypted category/date target mechanism** (blind index) — G1/G2 are gaps vs `PROJECT_DECISIONS`, but the intended mechanism needs the ADR.
- **KEK→Expense DEK→Attachment DEK three-tier** — implemented as KEK (versioned group key, wrapped per member) → group data key used **directly** as content DEK (no per-expense DEK) → per-attachment file key. Whether a per-expense DEK is required is ADR-dependent.
- **`direct_shared` scope** — sanctioned or remove?
- **merchant / notes / OCR / AI metadata fields** — v2 fields or future?

## 6. Future Architecture Candidates (FUTURE — not defects)
Encrypted thumbnails, resumable chunked uploads, natural-language search, budgets, exports, investment tracking. (Recurring expenses already exist via the scheduler.)

## 7. Risks
- **Category/date plaintext is load-bearing** for indexes, analytics, and month bucketing — encrypting later is a schema + query redesign, the highest future-risk item.
- **Rotation gap (G4)** risks permanently undecryptable history after any real rotation, especially post-logout / for new members.
- **No projection/search substrate** means AI/NL-search/reports currently depend on the live ledger query path.
- **Recurring without key version (G8)** produces group ciphertext that can't be version-resolved after rotation.

## 8–11. Files / Classes / Methods / Lines
As cited inline. Primary: `Expense` (`expense.entity.ts`), `ExpenseSplit` (`expense-split.entity.ts`), `CreateExpenseDto` (`create-expense.dto.ts`), `ExpensesService` (`expenses.service.ts`: `createExpense:529`, `updateExpense:863`, `persistSplits:424`, `deleteExpense:1107`, `restoreExpense:1154`, `getCombinedMonthlyAnalytics:1852`), `SettlementsService.calculateGroupBalances:169`, `GroupsService.getMyGroupKey:1261`, `GroupKeyService` (`group-key.service.ts:83,109,466`), `ExpenseDecryptionService.resolveKey:158`, `AuthState.logout` (`auth.state.ts:139`), `CryptoBootstrapService.bootstrapUserKeys:38`.

## 12. Severity
Critical: G1, G2 · High: G3, G4, G5 · Medium: G6–G10 · Low: G11.

## 13. Final Recommendations
Import the ADRs to resolve Section 5. Independent of ADRs, G1–G5 and G7/G8 are provable and should become tracked gaps (G1/G2 = new "encrypt category/date"; G3 = new "payload signing"; G4=ENC-002; G5=EXP-001; G7=EXP-003; G8=EXP-002). No code changed.

## 14. Final Verdict
**🟠 Major work remaining vs the target v2 architecture; ZK foundation sound and non-duplicating.** Suitable to freeze the *current* Expense architecture as a baseline, but the Verified Gaps (esp. G1/G2/G4/G5) and the ADR-dependent layers (projection/search/sync/attachments) must be resolved before v2 feature work is called complete.

## Functional scenarios (verified from code)

| # | Scenario | Result | Evidence |
|---|----------|--------|----------|
| 1 | A creates → B decrypts | ✅ Works | provisioning `groups.service.ts:557-599` → `group-key.service.ts:83,109` → `expense-decryption.service.ts:158-166` |
| 2 | B creates → A decrypts | ✅ Works | symmetric: both hold the wrapped group key |
| 3 | A edits → B decrypts update | ✅ Online only | `updateExpense:863` re-encrypts with active key; B re-fetches (no push — no WebSocket) |
| 4 | B edits → A decrypts update | ✅ Online only | same path |
| 5 | Logout → login → history decrypts | ✅ **only if no rotation** | logout wipes vault `auth.state.ts:146-148`; login re-derives `crypto-bootstrap.service.ts:38-43` and re-fetches ACTIVE key. Pre-rotation (superseded) versions can't be re-fetched (G4) |
| 6 | Device1 create → Device2 sync/edit → Device1 | ⚠️ Online round-trip only | no offline sync/delta/tombstone (grep empty); works via server + optimistic lock |
| 7 | Key v1 (Exp A) → rotate → v2 (Exp B) → both decrypt | ❌ **Historical access not preserved** | B (active) decrypts; A needs v1 key the backend won't serve (G4 `groups.service.ts:1261-1291`) |
| 8 | Personal dashboard = personal + only my share, never duplicated | ✅ Verified | `getCombinedMonthlyAnalytics:1852-1933` |
| 9 | Balances from Expense + Share + Settlements, never history/cache | ✅ Verified | `calculateGroupBalances:169` (splits + settlements only) |

## Mandatory questions
1. A→B decrypt? **✅ yes.** 2. B→A decrypt? **✅ yes.** 3. Edits propagate? **✅ online (no push).** 4. Decrypt after logout/login? **✅ if no rotation** (G4 caveat). 5. Rotation preserves history? **❌ no** (G4). 6. Expense only source of truth? **✅ yes** (splits derived, settlements separate, history audit-only). 7. Can Share always be rebuilt from Expense? **⚠️ splits are recomputable from split inputs, but on edit they're destroyed+recreated losing `isSettled` (G5), so prior settled state is NOT rebuildable.** 8. Any code duplicate financial truth? **⚠️ one nuance — carry-forward persists derived balances as expense rows (`closeMonth` ~1675-1805); otherwise no.** 9. Personal references shares not duplicates? **✅ yes.** 10. Balances from Expense+Share+Settlements? **✅ yes.** 11. History audit-only? **✅ yes.** 12. Every conclusion code-backed? **✅ yes.**
