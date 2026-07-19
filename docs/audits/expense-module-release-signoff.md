# Expense Module — Release Sign-off (Evidence-Only, Pre-ADR)

> **Official release-readiness sign-off.** Evidence-only; every conclusion cites file · method · line, verified first-hand.
> **Companion:** [expense-module-architecture-verification.md](expense-module-architecture-verification.md) (full architecture verification).
> **Missing ADRs:** `finmate-v2-adr.md`, `finmate-v2-non-goals.md` are **not in the repo** ([../architecture/adr/](../architecture/adr/) holds empty placeholders). Layers whose v2 scope only an ADR could define are marked REQUIRES ADR CONFIRMATION and are **not** counted as blockers.

## 1. Executive Summary

Encryption is **device-portable and invisible** for the everyday path (create, edit, decrypt, logout/login, reinstall, new device, join group) — the full key-recovery chain was verified. The module is **not** sign-off-ready because of **one user-visible key-management failure** (key rotation makes pre-rotation history undecryptable → "Unable to display this item") plus **two zero-knowledge leaks** (category, expenseDate stored plaintext). All three are code-proven and ADR-independent.

## 2. Release Readiness Score

**🟠 Major Work Remaining** — and **🔴 Not Ready** specifically against the "no key-management error ever" sign-off bar, because of the rotation path (G-ROT).

## 3–4. Verified Architecture / Implementations (VERIFIED IMPLEMENTATION)

- **Source of truth = Expense + ExpenseSplit + Settlement.** Balances derived live: `SettlementsService.calculateGroupBalances` `settlements.service.ts:169` (splits :272 + settlements :217-287). No stored balance.
- **Encrypted:** `title`, `description` — `expense.entity.ts:24-28`, enforced `create-expense.dto.ts` `@IsCiphertext` :26,:36. **Authoritative amount plaintext** `expense.entity.ts:30-35`.
- **Key recovery chain is device-portable (verified end-to-end):** master key = f(password) `encryption.service.ts:59`; private wrapping key server-stored & recovered `users.service.ts:154-175` → `group-key.service.ts:383-401` → decrypted with master key `getMyAsymmetricKeys:366-412`; group keys server-stored, re-unwrapped `fetchAndCacheGroupKey:466`, `unwrapKey:524`.
- **Cross-member provisioning:** `groups.service.ts:557-599` (`MemberWrappedGroupKey`).
- **Logout wipes/login rebuilds:** `auth.state.ts:146-148`; `crypto-bootstrap.service.ts:38-43`.
- **Personal dashboard references shares:** `getCombinedMonthlyAnalytics` `expenses.service.ts:1852-1933`.
- **History audit-only:** `writeAuditLog` `expenses.service.ts:240`; not read for balances.
- **ExpenseSplit = allocation only:** `expense-split.entity.ts:31-48`.
- **Optimistic version + soft delete + restore:** `expense.entity.ts:84-85,93-94`; `deleteExpense:1107`, `restoreExpense:1154`.

## 5. Verified Gaps (VERIFIED GAP)

| ID       | Gap                                     | Evidence                                                                                                   | Severity    |
| -------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------- |
| G-CAT    | Category plaintext, indexed             | `expense.entity.ts:40-41`, idx :18; DTO :60-62                                                             | Critical    |
| G-DATE   | ExpenseDate plaintext                   | `expense.entity.ts:55-56`; DTO `@IsDateString:75`                                                          | Critical    |
| G-ROT    | Backend ignores requested key version   | FE sends `?versionId=` `group-key.service.ts:494-495`; backend serves ACTIVE `groups.service.ts:1261-1291` | **Blocker** |
| G-SETTLE | Edit un-settles splits silently         | `persistSplits isSettled:false` `expenses.service.ts:477,520` (via `updateExpense:863`)                    | High        |
| G-SIGN   | No payload signing                      | grep → test fixture only                                                                                   | High        |
| G-SPLIT  | Split: no version/soft-delete           | `expense-split.entity.ts`                                                                                  | Medium      |
| G-KV     | Key version not refreshed on update     | `expenses.service.ts:987-988`                                                                              | Medium      |
| G-REC    | Recurring template no key version       | `recurring-expense.entity.ts`                                                                              | Medium      |
| G-PAGE   | Cursor key ≠ sort key                   | `id < :cursor` vs date sort                                                                                | Medium      |
| G-ATT    | Attachments simulated in `localStorage` | attachments audit                                                                                          | Medium      |
| G-DS     | Dead `direct_shared` scope              | `expense.entity.ts:81-82`                                                                                  | Low         |

## 6. Release Blockers

1. **G-ROT (key management):** after workspace key rotation, pre-rotation expenses are undecryptable for new members and any member post-logout/reinstall/new-device. Surfaces `DECRYPTION_FAILED_PLACEHOLDER = 'Unable to display this item'` (`crypto.constants.ts:10`) via `keyStatus:'error'`/decrypt-catch (`expense-decryption.service.ts:115,194`). Rotation is a shipped feature (`POST /groups/:id/keys/rotate`). **Minimum fix: make `GroupsService.getMyGroupKey` honor `?versionId=` (gap ENC-002).**
2. **G-CAT / G-DATE (ZK):** category & expenseDate server-visible plaintext — blockers if zero-knowledge is a release criterion (it is, per `PROJECT_DECISIONS.md`).

## 7. Requires ADR Confirmation

Projection layer, local/FTS search, offline sync (no tombstone/sequence/idempotency/delta), real attachment storage, per-expense DEK tier (expenses encrypt with group key directly — `features/groups/services/expenses.service.ts:55`), merchant/notes/OCR/AI fields, `direct_shared`. Not blockers without an ADR scoping them into v2.

## 8. Future Improvements

Encrypted thumbnails, resumable chunked uploads, NL search, budgets/exports/investments.

## 9. User Experience Risks

- ✅ Invisible across logout/login, reinstall, new device, joining a group (verified recovery chain).
- ❌ Visible failure after key rotation (G-ROT): "Unable to display this item" for historical expenses.
- ⚠️ Settlement can appear to vanish from an expense's splits on edit (G-SETTLE).

## 10. Security Risks

Category/date plaintext leak (metadata exposure); no payload signing (no tamper-evidence); a malicious member can upload a garbage wrapped key (decryption DoS, not confidentiality break — encryption audit).

## 11–14. Files / Classes / Methods / Lines

`Expense` (`shared/data-models/src/lib/expense.entity.ts`), `ExpenseSplit` (`expense-split.entity.ts`), `CreateExpenseDto` (`backend/src/app/expenses/dto/create-expense.dto.ts`), `ExpensesService` (`expenses.service.ts`: create:529, update:863, persistSplits:424, delete:1107, restore:1154, analytics:1852, closeMonth ~1675-1805), `SettlementsService.calculateGroupBalances:169`, `GroupsService.getMyGroupKey:1261`, `GroupKeyService` (`group-key.service.ts`: 366,383,466,494,524), `EncryptionService.deriveMasterKey:59`, `ExpenseDecryptionService.resolveKey:158`, `AuthState.logout` (`auth.state.ts:139`), `DECRYPTION_FAILED_PLACEHOLDER` (`crypto.constants.ts:10`).

## 15. Severity

Critical: G-CAT, G-DATE · Blocker: G-ROT · High: G-SIGN, G-SETTLE · Medium: G-SPLIT, G-KV, G-REC, G-PAGE, G-ATT · Low: G-DS.

## 16. Recommended Actions (minimum before freeze; no code changed here)

1. Backend honors `?versionId=` (ENC-002) — **unblocks the only user-visible key error.**
2. Encrypt category + expenseDate (blind-index for queries) — closes ZK leaks.
3. Adjustment records on settled-expense edits (EXP-001).
   (Stamp key version on recurring + update: EXP-002/EXP-003.)

## 17. Final Verdict

**🟠 Major Work Remaining** overall; **🔴 Not Ready** against the "zero key-management errors" sign-off bar until G-ROT is fixed.

## Functional scenarios

| #   | Scenario                                | Result              | Evidence                                                             |
| --- | --------------------------------------- | ------------------- | -------------------------------------------------------------------- |
| 1   | A creates → B decrypts                  | ✅                  | provisioning + recovery chain                                        |
| 2   | B creates → A decrypts                  | ✅                  | symmetric                                                            |
| 3/4 | A/B edit → other decrypts               | ✅ online (no push) | `updateExpense:863`                                                  |
| 5   | Logout → login → history                | ✅ (no rotation)    | `auth.state.ts:146-148`, `crypto-bootstrap:38-43`                    |
| 6   | Reinstall → history                     | ✅                  | server-stored keys re-fetched `group-key.service.ts:383-401,466-524` |
| 7   | New device → history                    | ✅                  | same chain                                                           |
| 8   | Rotation → logout → login → decrypt     | ❌                  | G-ROT (`groups.service.ts:1261-1291`)                                |
| 9   | Rotation → new member → history         | ❌                  | G-ROT — new member never gets superseded version                     |
| 10  | Personal = only my share, no dup        | ✅                  | `getCombinedMonthlyAnalytics:1852-1933`                              |
| 11  | Balances from Expense+Share+Settlements | ✅                  | `calculateGroupBalances:169`                                         |

## Mandatory questions

1 ✅ · 2 ✅ · 3 ✅ (online) · 4 ✅ · 5 ✅ reinstall · 6 ✅ new device · **7 ❌ rotation (G-ROT)** · **8 ⚠️ yes — post-rotation, new members permanently lose pre-rotation history** · **9 ✅ yes — users can see "Unable to display this item"** · 10 ✅ Expense only source of truth · 11 ⚠️ splits not fully rebuildable (settled state lost on edit, G-SETTLE) · 12 ✅ balances from Expense+Share+Settlements · 13 ⚠️ carry-forward persists derived rows (`closeMonth ~1675-1805`), else no · 14 ✅ history audit-only · 15 ✅ all code-backed.

## Sign-off question

> Can a normal user go years across devices, logouts, reinstalls, key rotations, and membership changes without losing data or seeing a key error?

**No.** Everything **except key rotation** is invisible and verified device-portable. **Key rotation** is the sole failure axis: pre-rotation expenses become undecryptable for new members and post-logout/reinstall members, showing "Unable to display this item." Single root cause: `GroupsService.getMyGroupKey` (`groups.service.ts:1261-1291`) serving only the ACTIVE wrapped key while ignoring the `?versionId=` the client already sends (`group-key.service.ts:494-495`). **Minimum change before freeze: fix that endpoint (ENC-002).** With it fixed, the key-management UX is clean; category/date encryption (G-CAT/G-DATE) remains required for the ZK guarantee.
