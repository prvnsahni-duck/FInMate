# Beta Receipt Storage Decision

Date: 2026-07-25
Source: `docs/release/RC1_READINESS.md` RB-2 ("Receipt attachments are stored in browser
`localStorage`, not any real backend"). This document supersedes RB-2 as the decision record for
that finding — RB-2 flagged the risk; this documents the full workflow trace and the recommended
disposition for Beta.

Scope: receipt attachment handling only. No application code changed. No architectural
refactoring performed or proposed — see Recommendation for why the smallest available change is
sufficient here.

## Current Implementation

### Where receipt data actually lives

Attachment records split across two completely separate storage tiers, and this split is the
source of every risk below:

| What                                                                                                            | Where                                                                             | Persisted?                                    | Syncs across devices? |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------- | --------------------- |
| Metadata (`storageKey`, `mimeType`, `sizeBytes`, `checksumSha256`, `encryptedFileKey`, `encryptedOriginalName`) | Postgres, `attachments` table (`shared/data-models/src/lib/attachment.entity.ts`) | ✅ Yes                                        | ✅ Yes                |
| The actual encrypted file bytes                                                                                 | Browser `localStorage`, key `sim_storage:<storageKey>`                            | ❌ No — device-and-browser-profile local only | ❌ No                 |

The `storageKey` column name is misleading by itself — it reads like a pointer into real object
storage (S3/Supabase-style), but it only ever resolves to a `localStorage` key on whichever single
browser wrote it.

### Complete workflow trace

- **Upload** (`create-expense-modal.component.ts:476-493`): file read as `ArrayBuffer` client-side
  → AES-GCM encrypted with a fresh per-file key → file key wrapped with the expense's scope key →
  `localStorage.setItem('sim_storage:' + storageKey, encryptedBytes)`, **no `try/catch` around this
  specific call**. It sits inside the same `try` block as the rest of `saveExpense`'s encryption
  and HTTP-save logic, which does have an outer `catch` (`:599-602`) — so a thrown
  `QuotaExceededError` here does **not** silently drop just the attachment; it aborts the _entire_
  expense save (the HTTP request to persist the expense hasn't been made yet at this point in the
  function), surfacing as a generic `'Failed to encrypt and save expense.'` message that gives the
  user no indication the real cause is browser storage being full.
- **Preview**: there is none. Confirmed via full-codebase search — no thumbnail, no inline image
  rendering, anywhere. The composer shows a plain filename+size chip while attaching
  (`attachedFiles: {name, size, key}[]`); the saved-expense view shows a generic icon button with
  no visible filename (`group-detail.component.html:1207-1229`) that only decrypts and renders
  content when clicked.
- **Storage**: `localStorage`, encrypted-at-rest (the bytes written are already AES-GCM ciphertext
  — this part is genuinely zero-knowledge-compliant; the problem is the storage _tier_, not a
  crypto weakness). Browser/profile-scoped, subject to the browser's per-origin `localStorage`
  quota (commonly 5–10MB total, shared with everything else the app puts in `localStorage`,
  including auth tokens).
- **Persistence**: the `Attachment` row persists correctly and forever (barring expense deletion).
  The bytes it points to persist only as long as that specific browser profile's storage is
  never cleared and the quota is never exceeded.
- **Sync**: metadata syncs (an attachment "chip" correctly appears on any device once the expense
  loads); content does not. Clicking the chip on a device other than the one that uploaded it
  throws `'Attachment file data not found in simulation storage'`
  (`group-detail.component.ts:1068-1071`), caught and shown via `alert(...)`
  (`group-detail.component.ts:1092`) — not silent, but the message leaks an internal
  implementation term ("simulation storage") that means nothing to a real user and gives no
  actionable guidance.
- **Backup**: none. No export path includes receipt bytes (the ledger/CSV export
  (`export.controller.ts`) is structured financial data only), and nothing server-side ever holds a
  copy to restore from.
- **Delete**: removing an attachment from an already-saved expense during edit
  (`create-expense-modal.component.ts:633-644`, `removeAttachment`) only splices the in-memory
  `attachedFiles` array — it never calls `localStorage.removeItem`. Confirmed via full-codebase
  search: there is **no `localStorage.removeItem` call anywhere for `sim_storage:*` keys, at all**.
  Deleting the whole expense doesn't free its attachments' `localStorage` entries either. Storage
  usage is monotonically increasing for the lifetime of the browser profile — this is not a
  "might eventually hit quota" risk, it's a "will eventually hit quota with ordinary use and zero
  cleanup ever occurring" certainty.
- **Edit**: adding new attachments to an existing expense works through the same upload path.
  Removing one leaves its bytes permanently orphaned in `localStorage` (see Delete above).
- **Export**: does not include receipt files; not a new risk vector either way.
- **Browser refresh (same device)**: works correctly — metadata re-fetches from the backend,
  `localStorage` survives a refresh, decryption on click succeeds.
- **Logout/login (same device)**: works correctly — `sim_storage:*` entries are a separate
  `localStorage` namespace from the session/key-clearing logic that runs on logout, so they're
  untouched by it; after login, the master key re-derives and decryption on click still succeeds.
- **Multi-device**: broken as described under Sync — this is the primary, reliably-reproducible
  failure mode, not an edge case.

### A secondary, lower-probability risk noticed during this trace

`downloadAttachment`'s `else` branch (`group-detail.component.ts:1094-1108`, taken when
`encryptedFileKey`/`encryptedOriginalName` are missing) fabricates placeholder text —
`` `Decrypted content of: ${file.originalName} (${file.storageKey})` `` — and offers it as a
download, rather than erroring. The current create flow always populates both fields, so this
branch appears unreachable in practice today; flagged here because if it is ever reachable (e.g. a
future write path that omits them), a user would download fabricated content believing it to be
their real receipt. Out of scope to fix here (would touch code beyond receipt storage), but worth
a follow-up ticket.

## Risks

| Risk                                                                                                           | Severity                                                 | Trigger                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Receipts silently and permanently unrecoverable if browser data is cleared                                     | High                                                     | Any "clear browsing data," private/incognito use, browser reinstall, or profile switch. No warning before it happens; nothing to recover from afterward. |
| Receipts invisible on any device other than the one that uploaded them                                         | High                                                     | Using the app from a second device (phone + laptop) — an extremely normal usage pattern, not an edge case.                                               |
| Storage exhaustion blocks _expense creation entirely_ (not just the attachment)                                | Medium                                                   | Guaranteed to occur eventually given zero cleanup on delete/edit; timing depends on receipt volume/size, but the trend is one-directional.               |
| Confusing, internal-sounding error messages when either of the above occurs                                    | Medium                                                   | Same triggers as above; makes the failure look like a bug rather than a known, permanent limitation.                                                     |
| UI gives no indication receipts behave differently from every other synced, backed-up piece of data in the app | High (root cause of all of the above being _surprising_) | Always — there is currently no copy anywhere mentioning this.                                                                                            |

## Evaluate

- **Can users reasonably expect receipts to sync?** Yes, reasonably — everything else in the app
  (expenses, splits, settlements, history) is genuinely end-to-end encrypted _and_ synced across
  devices. Nothing distinguishes receipts as behaving differently until the moment sync fails.
- **Can receipts be silently lost?** Clearing browser data: yes, fully silent, no warning, no
  recovery path. Cross-device access: not silent (an alert fires) but not helpful either — the
  message is a debug leak, not a status explanation, and gives no sense that this is expected,
  permanent behavior rather than a transient error worth retrying.
- **Is the UI honest about current behavior?** No. Nothing in the upload flow, the attachment chip,
  or anywhere else states that receipts are device-local only.
- **Acceptable for personal daily use (a single, informed user)?** Yes, once informed. A user who
  knows to expect device-local-only storage — and either sticks to one device or accepts the
  limitation — loses nothing they weren't told about. This is the scope this task's Objective
  actually asks about.
- **Acceptable for a public beta (multiple, uninformed real users)?** No, not without the warning
  at minimum, and even then it's a materially weaker product promise than every competing expense
  app. Most users won't carefully read a warning, will use multiple devices as a matter of course,
  and will eventually lose real data with no way for anyone to help them recover it.

## Recommendation

### Safe with Warning (Option B)

Keep receipt attachments enabled, exactly as implemented today, and add the warning text this
task specifies:

> "Receipts are stored only on this device and may be lost if browser data is cleared."

placed where a user will see it before or at the point of attaching a file (the upload control in
`create-expense-modal.component.ts`), not buried in settings.

### Rationale

- **Matches "smallest change that makes the product safe for daily use."** This task's Objective is
  explicitly personal daily use, not public beta. For a single informed user, the entire risk list
  above collapses to "know the limitation" — which the warning directly provides. No storage
  behavior needs to change for that to be true.
- **Option A (disable) throws away real, working value for no corresponding safety gain once the
  user is informed.** The encryption, key-wrapping, and metadata persistence are all already
  correct — only the byte-storage tier is a placeholder. Disabling the feature protects nobody that
  a warning doesn't already protect, and removes a feature that already partially works (same-device
  use is completely fine).
- **Option C (backend storage) is explicitly out of scope for this task** ("Do not redesign the
  attachment system," "do not refactor") and is a materially larger change — a real upload
  endpoint, an object-storage integration (the codebase's own roadmap already earmarks Supabase for
  this, per `ARCHITECTURE.md` "Zero-Knowledge Attachment Storage"), storage-quota/cost handling, and
  migration of the `else`-branch legacy-download path noted above. That's next-release work, not a
  Beta-safety fix.
- **The warning is honest, not a workaround.** It doesn't paper over the multi-device and
  clear-data risks — it makes them a disclosed, accepted tradeoff instead of a surprise. That's the
  actual bar "safe for daily use" needs to clear for a single, informed user.

## Implementation Effort

Small — UI copy only, no logic changes:

1. Add a one-line warning near the file-attach control in `create-expense-modal.component.ts`'s
   template (a caption/hint under the upload button).
2. Optionally, the same line as a tooltip/caption on the attachment chip itself
   (`group-detail.component.html:1218-1229`) so it's visible after the fact too, not just at
   upload time.
3. No changes to `create-expense-modal.component.ts`'s or `group-detail.component.ts`'s TypeScript,
   no backend changes, no DTO/entity changes, no test changes beyond whatever snapshot/DOM
   assertions (if any) would need updating for the new copy.

Estimated: under an hour, two small template edits.

## Release Impact

- **Unblocks personal daily use immediately** with the current codebase, no further engineering
  required beyond the copy change above.
- **Does not unblock public beta.** If/when broader release is on the table, Option C (backend/
  object storage) becomes the right call — flag this decision for revisit at that point rather than
  treating "Safe with Warning" as a permanent state for a multi-user audience.
- **No regression risk.** Nothing about how receipts function changes; only what the user is told
  changes.

## Conclusion

**Safe with Warning**
