# Personal Finance Audit — 2026-07-16

## Summary

The **personal expense** path and the **personal dashboard aggregation** are genuinely implemented and compliant: expenses exist as single records, the backend joins `expense_splits` with `expenses` to compute "personal expenses + user's share of group/split expenses," and personal-scope titles/descriptions are encrypted client-side with the password-derived User Data Key (UDK/master key). No duplicate encrypted records were found.

**Goals** and **Notes** are effectively **schema-and-DTO stubs / roadmap**: DB tables, TypeORM entities, and validation DTOs exist and are registered, but there is **no backend controller or service** and **no working frontend** (goals is a hard-coded HTML mockup with an empty component; notes has no UI at all). Two documented guarantees are broken/unmet:

- **User deletion "removes PII only"** is **not implemented at all** — `DELETE /users/me` is documented in `openapi.yaml` but no route/service exists.
- **Goal titles must be encrypted client-side** (PRD) — the `Goal` entity/DTO store `title` as plaintext `VARCHAR(160)` with no ciphertext validation.

An undocumented third encryption scope (`direct_shared`) exists in code beyond the documented personal/group model.

## Findings table

| # | Documented guarantee | Status | Evidence (file:line) | Gap | Priority |
|---|---|---|---|---|---|
| 1 | Personal dashboard aggregates personal expenses + user's share of group/split expenses via backend join of `expense_splits` × `expenses` | ✅ | `backend/src/app/expenses/expenses.service.ts:1852-1933` (getCombinedMonthlyAnalytics), `:1882-1895` (split innerJoin), `:1899-1922` (100% personal + amountOwed shares) | Aggregation lives in analytics/`listExpenses`, not a single "dashboard" endpoint, but behavior matches | — |
| 1b | No duplicate expense records | ✅ | `expenses.service.ts:769-792` (single `expenses` table query, membership-scoped), `:1858-1867` single record per expense | None | — |
| 2 | Personal-scope data encrypted with UDK client-side | ✅ (personal expenses only) | `frontend/.../encryption.service.ts:59` (deriveMasterKey PBKDF2), `:233` encryptExpense; `expense-decryption.service.ts:198-202` (personal → master key) | Only expenses; goals not encrypted, notes not implemented (see #3/#4) | — |
| 3 | Goals: entity, target/saved/progress, attachments; titles encrypted client-side (PRD.md:108,137) | 📋 Roadmap + ❌ crypto | Entity `shared/data-models/src/lib/goal.entity.ts:20-36`; table `backend/src/migrations/1717977600000-InitialSchema.ts:146-159`; DTO `dto/goal.dto.ts`; attachments FK `InitialSchema.ts:168`. No controller/service (grep empty). Frontend empty: `dashboard-goals.component.ts:8`, static mockup `dashboard-goals.component.html` | No CRUD anywhere; `title` stored plaintext, **violates PRD client-side encryption requirement** | High (crypto), Med (feature) |
| 4 | Notes: personal + group rich notes with attachments; group notes encrypted with Group Key | 📋 Roadmap-only | Entity `note.entity.ts:14-45` (visibility, groupKeyVersion FK); DTO `dto/note.dto.ts` (`@IsCiphertext` on title/body — good); table `InitialSchema.ts:131-142`, group-key link `1719000000000-AddGroupKeyVersioningModel.ts:108-128`. No controller/service, no frontend | Not implemented; Group-Key encryption only schema-supported, not enforced in code | Med |
| 5 | User deletion removes PII only | ❌ | Documented `openapi.yaml:318-328` (`DELETE /users/me` Deactivate). No delete route in `users.controller.ts` (only Get/Patch/Post); no delete/anonymize/PII method in `users.service.ts` or `auth.service.ts` | Endpoint entirely unimplemented; no PII-removal logic exists | High |
| 6 | (Encryption scope model = personal/group) | ⚠ Undocumented | `expenses.service.ts:61,340-347`; `expense-decryption.service.ts:175-196` (`direct_shared` with per-user wrappedContentKeys) | Third scope not in ARCHITECTURE.md's two-scope model | Low |

## Detailed findings for each ⚠/❌

### #3 Goals — plaintext title contradicts zero-knowledge PRD (❌ crypto) and no implementation (📋)
- `shared/data-models/src/lib/goal.entity.ts:20` declares `@Column({ type: 'varchar', length: 160 }) title` — plaintext, no encryption transformer.
- `shared/data-models/src/lib/dto/goal.dto.ts` validates `title` with `@IsString/@MaxLength(160)` only — **no `@IsCiphertext`** (contrast: `note.dto.ts` does apply `@IsCiphertext`).
- PRD.md:108 ("Encrypt goal titles client-side") and PRD.md:137 (UDK encrypts saving goals) are therefore unmet at the type/validation layer.
- No `GoalsController`/`GoalsService`/`GoalsModule` exist (grep returned nothing). The entity is registered only for schema autoload: `backend/src/app/app.module.ts:26,138`.
- Frontend `DashboardGoalsComponent` is an empty class (`dashboard-goals.component.ts:8`); the HTML is a static three-card mockup with hard-coded "$15,000 / $25,000", "Buy New Car", etc. No API calls, no `savedAmount/targetAmount/progress` binding.
- Attachments for goals are schema-only (`InitialSchema.ts:168`, `attachment.entity.ts:31-33`); no upload path.

### #4 Notes — schema/DTO only, no runtime (📋)
- Entity and table exist with `visibility: 'private' | 'group'` and a nullable `groupKeyVersion` FK (`note.entity.ts:22-35`) intended for Group-Key-encrypted group notes; migration wires `group_key_version_id` (`1719000000000-AddGroupKeyVersioningModel.ts:108-128,193`).
- `CreateNoteDto`/`UpdateNoteDto` correctly require ciphertext (`dto/note.dto.ts` `@IsCiphertext` on `title`/`body`) — the *design* enforces ZK, but nothing consumes these DTOs.
- No `NotesController`/`NotesService` and no frontend notes UI exist. Group-Key encryption of group notes is thus not enforced anywhere in code.

### #5 User deletion — documented but entirely missing (❌)
- `openapi.yaml:318-328` documents `DELETE /users/me` "Deactivate user account" → 204.
- `backend/src/app/users/users.controller.ts` has no `@Delete` handler (routes: lookup, search, me GET/PATCH, me/keys, :id/public-key).
- `backend/src/app/users/users.service.ts` has no delete/deactivate/anonymize/PII-purge method (full file reviewed).
- `auth.service.ts` only *reads* `user.status !== 'active'` (`:103,:301`) for login gating; nothing sets status to deleted/deactivated or scrubs PII.
- Net: the approved "User deletion removes PII only" decision (`docs/PROJECT_DECISIONS.md:21`) has zero implementation; the account cannot be deleted or deactivated via API.

### #6 Undocumented `direct_shared` scope (⚠)
- Code supports a third `encryptionScope` = `direct_shared` (`expenses.service.ts:61,340-347,663`; frontend `expense-decryption.service.ts:175-196`) where a content key is wrapped per participant user (`wrappedContentKeys`) rather than personal-UDK or Group-Key. ARCHITECTURE.md documents only personal (UDK) and group (Group Key). This path also feeds the personal aggregation (`getCombinedMonthlyAnalytics` sums `amountOwed` for `split.participantUserId = user`, `:1892`), so it is load-bearing for the "user's share" calculation but undocumented. (Note: the Expense audit found the backend validator currently *rejects* `direct_shared` on create — see expense-audit.md "Undocumented behavior #1"; reconcile these when documenting.)

## Undocumented behavior found

1. **`direct_shared` encryption scope** (see #6) — a non-group, per-user-wrapped-key sharing mode absent from ARCHITECTURE.md / PROJECT_DECISIONS.md, yet part of the personal-dashboard share aggregation.
2. **Aggregation currency fallback mismatch**: `getCombinedMonthlyAnalytics` defaults missing currency to `'USD'` (`expenses.service.ts:1904,1917`) while user profiles default to `'INR'` (`users.service.ts:47`) — can mis-bucket amounts by currency key.
3. **`ledgerMonth` dual-path matching**: aggregation matches either `expense.ledgerMonth = :month` OR `expenseDate LIKE 'YYYY-MM%'` (`expenses.service.ts:1888`), an undocumented carry-forward interaction affecting which month a share lands in.
4. **Attachment zero-knowledge design is fully specified but dormant**: `attachment.entity.ts` documents a `wrappedFileKey` (`iv:ciphertext`, wrapped by personal/group/content key) and a `groupKeyVersion` link, matching ARCHITECTURE.md's "Future … Attachment Storage" roadmap — present as schema only, no controller/upload, so it is roadmap not runtime.
