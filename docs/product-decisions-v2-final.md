# FinMate v2 — Final Product Decisions (Feature Freeze, 2026-07-17)

> Owner-ratified decisions from the 2026-07-17 feature-freeze review, plus recommended models for
> the two items still needing a model choice. **No code changes accompany this document.**
> Items marked **DECIDED** are owner decisions of record; items marked **RECOMMENDED** await
> ratification. On ADR import, fold each item into its canonical ADR and run the reconciliation
> protocol in [architecture/canonical-sources.md](architecture/canonical-sources.md).

---

## 1. Historical key access — **DECIDED: new members see all historical expenses (Option A)**

**Current behaviour.** A member joining after a key rotation can obtain only the ACTIVE version's
wrapped key: every `MemberWrappedGroupKey` creation path targets ACTIVE (`groups.service.ts`
invite/provision/rotate), and `getMissingGroupKeys` audits only ACTIVE. Historical expenses carry
their version stamp and the read path serves superseded versions (`GET keys/me?versionId=`), but
nothing can _provision_ a superseded version's wrapped key to a new member — so pre-join history
shows "Unable to display this item". `GET /groups/:id/keys/versions` (new) already enumerates
versions.

**Pros of A.** Matches pre-versioning semantics (an invite wrapped THE group key, which decrypted
everything — frozen-decisions:15); the ledger's financial content (amounts, currency, dates,
categories, splits, balances) is already server-visible plaintext by decision §3, so denying only
titles/descriptions of old items is weak privacy with real UX cost; versioning was introduced for
rotation bookkeeping, not access control. **Cons.** A member evicted _before_ sensitive history was
written is unaffected either way; the only privacy loss is toward genuinely-new members — accept,
since inviting someone into a shared ledger is itself the sharing decision.

**Required backend behaviour (when freeze lifts):**

1. `provisionGroupKeys` accepts an optional `groupKeyVersionId` (default: ACTIVE); validated
   group-scoped, REVOKED rejected — same rule as the expense stamp path.
2. `getMissingGroupKeys` (or a `?allVersions=true` variant) reports missing `(userId, versionId)`
   pairs across all non-REVOKED versions.
3. Client self-healing (`checkAndProvisionMissingKeys`) iterates `GET keys/versions` and wraps each
   missing historical key for new members (any member holding the key can wrap; owner/admin flow by
   default).
4. Invite flow unchanged — history heals lazily after join.

**Impact.** No schema change (`member_wrapped_group_keys` is already per-user × per-version).
Backend: two method extensions. Frontend: extend the existing healing loop. ~2–4 days.

---

## 2. Settled expense editing — **DECIDED: editing allowed, complete version history kept**

Scope of history: **Expense, ExpenseSplit, Settlement, Attachment metadata, Receipt metadata.**

**Current behaviour.** Edits are allowed; splits are soft-deleted and recreated with
`isSettled:false` (soft-delete landed 2026-07-17 — the _replaced_ allocation is now preserved, a
partial history). `Expense` has an optimistic `@VersionColumn` but no snapshot of prior states;
`Settlement` rows are separate and never mutated by expense edits; attachment metadata rows are
replaced in place; receipts are simulated.

**Recommended implementation model: copy-on-write revision tables, keyed by the existing
`@VersionColumn`.**

- One `entity_revisions` table (or per-entity `*_revisions` tables): `entity_type`, `entity_id`,
  `version`, `payload jsonb` (the row as-written, ciphertext fields stay ciphertext — ZK-safe),
  `actor_user_id`, `created_at`. Written transactionally on every create/update/soft-delete via
  TypeORM subscribers (or DB triggers for tamper resistance — preferred).
- **Revisions are audit artifacts only** — never read for balances or display defaults. This keeps
  the frozen invariants intact: balances always derive live from splits + settlements
  (frozen-decisions:52), history stays write-only (frozen-decisions:27), no second source of truth.
- Settled-state semantics on edit: where a recreated split's `(participant, amountOwed)` is
  unchanged, carry `isSettled`/`settledAt` forward; where it changed, the split reopens **and** a
  linked `settlement_adjustment` record referencing the affected `Settlement` is written, so the
  reversal is explicit rather than silent (closes EXP-001's "no adjustment trail"). Surface an
  "edited after settlement" indicator in the UI.
- Alternatives considered: full event sourcing (rejected — architectural redesign, disproportionate
  for v2); status-quo soft-delete only (rejected — no Expense/Settlement/attachment history, silent
  settlement reversal remains).

**Impact.** One migration + subscribers/triggers + carry-forward logic in `persistSplits` +
adjustment record on settled-split change. ~1–1.5 weeks. No architectural change.

---

## 3. Category & ExpenseDate remain plaintext — **DECIDED; internal-consistency check: PASS (with two doc actions)**

**Verified consistent with:**

- `frozen-decisions.md:12` — plaintext `amount_total`, `currency`, `category`, `expense_date` is
  declared intentional (enables server-side aggregation). The decision _re-affirms_ existing canon.
- Schema and indexes (`expense.entity.ts` category/date columns + composite indexes), DTO
  validation, list filters, category/monthly analytics, and the household `ledgerMonth` close cycle
  (derived server-side from `expenseDate`) — all depend on plaintext and continue to work unchanged.
- `frozen-decisions.md:53` (no client-side plaintext of **ZK fields** sent for search) — consistent:
  by this decision category/date are not ZK-protected fields, so server-side filters on them do not
  violate the rule.
- Zero-knowledge boundary remains: `title`/`description` (+ attachment names/content) ciphertext,
  enforced by `@IsCiphertext`.

**Required follow-through (docs only):**

1. When ADR-003 is imported, its text must record this classification — the 2026-07-17 audit briefs
   assumed the opposite (encrypted category/date, opaque CategoryUUID); at reconciliation mark
   G-CAT/G-DATE `Won't Fix (ADR-reconciled)` in the audit docs.
2. Privacy disclosure: user-facing material must state that amounts, currency, dates, and category
   labels are server-visible metadata; only titles, notes, and attachments are end-to-end encrypted.

---

## 4. Password recovery — **RECOMMENDED: Recovery-Key model (plus plain password change)**

**Current behaviour.** No change/forgot/reset flow exists (AUTH-002). The master key derives from
the password (PBKDF2); the private wrapping key and symmetric-wrapped group keys are recoverable
only with it — losing the password today means permanent loss of encrypted data.

**Recommended model (v2):**

- **Password change (old password known):** verify → derive new master key → client re-wraps the
  private wrapping key and every symmetric-wrapped key under the new master key → atomically swap.
  Pure engineering, no policy risk. (Frozen-decisions:34 already mandates "re-wraps the UDK, does
  not re-encrypt data" — this is that.)
- **Recovery Key (forgot password):** at signup (and re-generatable from settings) the client
  generates a high-entropy 256-bit recovery code (BIP39-style phrase or grouped base32), derives a
  recovery key from it, wraps the master-key material under it, and stores only the wrapped blob
  server-side; the code itself exists only with the user (download/print prompt). Reset flow:
  prove email ownership → enter recovery code → client unwraps → re-wrap under the new password.
  Server never sees key material — fully zero-knowledge, and the industry-standard pattern
  (1Password Secret Key / Bitwarden recovery code).
- Without a recovery code, reset degrades to **explicit data loss** (account reset with a clear
  warning) — acceptable only as the fallback path, prominently labelled.
- **Rejected:** server-escrowed keys (violates frozen-decisions:10/18). **Deferred to v3:** social
  /guardian recovery (Shamir shares of the recovery key wrapped to trusted contacts — the existing
  RSA-OAEP member-wrapping plumbing makes this a natural extension).

**Impact.** Two user columns (recovery-wrapped blob + metadata), signup/settings UI, reset flow,
throttle profiles already exist (`forgotPassword`/`resetPassword`). ~1.5–2 weeks.

---

## 5. Rotation UI placement — **RECOMMENDED: Group Settings → "Encryption keys" panel (owner/admin)**

**Current behaviour.** Rotation is fully functional at the service/API level
(`GroupKeyService.rotateGroupKey` + `POST /groups/:id/keys/rotate`, audited, version-safe) but has
**no UI surface at all** — there is no key-management section anywhere (even the legacy
`refreshGroupKey()` component method was never wired to a template).

**Recommendation.**

- A dedicated **"Security / Encryption keys"** card inside the existing Group Settings area,
  visible to owner/admin only (reuse `isOwnerOrAdmin()`), showing: current key version + created
  date (`GET keys/versions`), per-member provisioning status (`GET keys/missing`), and rotation
  history (superseded versions + reasons — already returned by the versions endpoint).
- **"Rotate key"** button there, behind a confirm dialog with an optional reason (flows into the
  audit log). After rotation, surface `skippedUserIds` (members lacking a public wrapping key) with
  a follow-up "provision keys" action, and — once decision §1 ships — a "share history with new
  members" prompt.
- **Proactive trigger:** after removing a member, prompt the owner/admin to rotate ("Rotated on
  demand or member eviction" — zk_group_key_provisioning_architecture.md §1). Do not auto-rotate;
  eviction-time rotation should be a one-tap suggestion, not silent.
- Keep rotation out of the invite/member list flows themselves — it is a security-admin action, and
  burying it in member management invites accidental rotations.

**Impact.** One settings panel wiring existing endpoints/service; no new backend work. ~2–3 days.

---

## Decision register summary

| #   | Item                           | Status                                                                                 | Follow-up owner                    |
| --- | ------------------------------ | -------------------------------------------------------------------------------------- | ---------------------------------- |
| 1   | Historical key access          | **DECIDED — Option A** (share history)                                                 | Backend + FE healing (post-freeze) |
| 2   | Settled expense editing        | **DECIDED — editing allowed + full version history**; revision-table model recommended | Backend (post-freeze)              |
| 3   | Category/ExpenseDate plaintext | **DECIDED — remain plaintext**; consistency verified                                   | ADR-003 text + privacy disclosure  |
| 4   | Password recovery              | **RECOMMENDED — Recovery-Key model** + password change                                 | Owner ratification                 |
| 5   | Rotation UI                    | **RECOMMENDED — Group Settings "Encryption keys" panel**                               | Owner ratification                 |
