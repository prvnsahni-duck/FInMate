# FinMate Known Issues

Tracked gaps deliberately deferred out of a release. Fix during a stabilization
cycle, not before a freeze.

---

## KI-1 — Group History log shows encrypted expense titles

- **Area:** Frontend · Group detail → History tab (`group-history-log.component.ts`)
- **Severity:** Low — UX polish only. Not a functional bug, security issue, or
  data-corruption risk. **Not release-blocking.**
- **Status:** Interim mitigation shipped (2026-07-14 merge of the Developement
  branch): `GroupsService.getHistoryLogs` now decrypts `metadata.title` /
  `newTitle` / `previousTitle` client-side using the group's **active** key,
  with a placeholder on failure. This is effectively Option 3 behavior — it
  works for all entries until a key rotation occurs, after which entries
  encrypted under superseded versions show the placeholder (audit metadata
  still carries no `groupKeyVersionId`). The agreed end-state below still
  stands for v2.1.
- **Direction agreed:** Option 1 (neutral phrasing). Option 3 rejected as the
  _final_ design (see status note above for the shipped interim).

### Symptom

Audit entries render the raw ciphertext instead of the title, e.g.
`created expense "9dK…:aB3…"` instead of `created expense "Groceries"`.

### Root cause

Titles are end-to-end encrypted and, by design, **the backend never decrypts
them** (see `PROJECT_DECISIONS.md` → Security). When an expense is
created/updated/deleted/restored, the backend stores the already-encrypted
title into the audit log metadata
(`expenses.service.ts` — `metadata: { title: saved.title }`, and the
`newTitle` / restore variants). The History view reads
`log.metadata?.title` / `log.metadata?.newTitle` and renders it directly,
bypassing the centralized decryption pipeline (`ExpenseDecryptionService`).

This is the one screen displaying an expense title that does **not** go through
the pipeline; ledger, trash, dashboard, and attachments all do.

### Why deferred

Not a trivial pipeline hookup — it needs a decision:

- Audit metadata does **not** carry `groupKeyVersionId`, so decrypting on the
  client can pick the wrong key version for older entries (group keys rotate),
  producing a failed/incorrect decrypt.
- Alternatively the backend could stop storing titles in audit metadata, which
  changes the audit contract.

Touching a secondary view right before a freeze risks a regression for no
functional gain.

### Options (to evaluate next cycle)

1. ✅ **Preferred — Backend:** stop persisting titles in audit metadata; render a
   scope-neutral phrase: `updated an expense`, `deleted an expense`,
   `restored an expense`. History is an audit log, not a ledger — most financial
   apps omit item names from audit trails. Simplest; no client crypto in
   history; no encrypted blobs stored; no future migration; stable records.
2. ⚠️ **Acceptable if titles are truly wanted — Backend:** persist enough
   metadata to decrypt correctly _forever_, then reuse the existing pipeline
   (`GroupKeyService.resolveGroupKey` → `ExpenseDecryptionService`). Requires
   audit metadata to carry: `title`, `scope`, `groupId`, `groupKeyVersionId`.
   This is really an **audit data-model completion**, not a frontend fix.
3. ❌ **Rejected — Frontend best-effort:** decrypt against the group's _active_
   key only. New entries decrypt but older ones fail unpredictably after key
   rotation — inconsistent UX that is worse than a stable neutral message.

**Decision:** go with **Option 1** in v2.1. It's not a frontend bug — the
underlying issue is an incomplete audit data model, and Option 1 sidesteps it
cleanly. Escalate to Option 2 only if product decides history must show titles.
