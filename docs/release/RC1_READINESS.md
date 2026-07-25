# FinMate RC1 Readiness Audit

Date: 2026-07-25
Scope: release-readiness only — crashes, broken flows, incorrect data, security/permission issues,
encryption failures, session problems, navigation, data loss, validation, missing loading/error
states. Architectural duplication, code organization, and style are explicitly out of scope for
this pass (see `docs/audits/*-architecture-audit.md` for that lens) and are not reported here
unless they directly cause a production bug.

Method: targeted code-path tracing of the journeys listed below, cross-checked against this
session's existing audit findings (`docs/architecture/gap-tracker.md`,
`docs/audits/expense-audit.md`, `docs/audits/groups-audit.md`,
`docs/audits/groups-architecture-audit.md`) to confirm which flagged gaps are still live in the
current code versus already fixed. No live dev-server walkthrough was performed in this pass —
findings are based on reading the actual request-handling code for each journey, not on clicking
through the running app. Automated test suites (386 backend + 226 frontend tests, all currently
passing per `docs/EXPENSE_MODULE_FREEZE.md`) provide corroborating evidence that the core
expense/settlement/carry-forward math is correct; this audit focused its own fresh effort on
journeys those suites don't cover well: registration/invite/join, and storage-backend reality.

## Release Blockers

### RB-1: Joining a group via invite link duplicates the membership instead of claiming it — silent role downgrade and balance/history fragmentation

**Journey affected:** Invite member → Join group (for anyone invited by email/phone who did not
already have a FinMate account at invite time — very plausibly the majority of real-world first
invites, e.g. "invite my partner who's never used this app").

**What happens today:**

1. Owner invites `partner@email.com`, who has no account yet. `GroupsService.inviteMember`
   resolves this via `ContactsService.resolveOrCreateIdentity` and creates a **Contact-backed**
   `GroupMember` row (`contact` set, `user` NULL, role as invited — e.g. `admin`) —
   `groups.service.ts:566-577`. An invite email with a `/groups/join/:token` link is sent
   (`groups.service.ts:689-696`).
2. Partner clicks the link, registers a real account (this step works correctly —
   `UsersService.createUser` has no conflict with the Contact row, since no `User` row exists for
   that email), and the frontend calls join (`join-group.component.ts:69-71` →
   `GroupsService.joinGroup` → backend `joinGroupByToken`).
3. `GroupsService.joinGroupByToken`'s existing-membership check
   (`groups.service.ts:1219-1223`) queries **only** `member.user_id = :userId`. The Contact-backed
   row created in step 1 has `user_id = NULL`, so this query finds nothing.
4. Falling into the "no existing member" branch (`groups.service.ts:1246-1254`), the code creates
   a **brand-new** `GroupMember` row for this person, with **role hardcoded to `'member'`**
   regardless of what role they were actually invited with.

**Result:** the group now has two `GroupMember` rows for the same person — the original
Contact-backed one (now orphaned, `user` still NULL, retains whatever role/history it had) and a
new User-backed one (role always `'member'`, no history). Neither of `GroupMember`'s two unique
constraints (`@Unique(['group','user'])`, `@Unique(['group','contact'])` —
`group-member.entity.ts:24-25`) catches this, because the new row's `user` differs from the old
row's `null` and the new row never sets `contact` at all — the INSERT succeeds silently. No error
is shown to the user; `join-group.component.ts`'s `onJoin()` sees a 200 response and navigates
straight to the group page (`join-group.component.ts:167-172`).

**Concrete impact:**
- If the person was invited as `admin` or `owner`-track, they are silently downgraded to `member`.
- If any expenses/splits were ever attributed to the original Contact-backed membership before
  they joined (plausible in a household group where the owner starts logging shared expenses
  immediately and assigns the not-yet-registered partner as a participant), that history stays
  attached to the orphaned row and will not show as "theirs" going forward — both their own balance
  view and other members' views of who-owes-whom will be **incorrect**, meeting this report's
  "incorrect balances" blocker criterion directly.
- Compare: the *other* path that links an invite to a real account —
  `AuthService.verifyEmail` → `ContactsService.claimContactsForUser`
  (`contacts.service.ts:294-310`) — does this correctly: it finds the existing Contact-backed
  `GroupMember` row and **updates** it in place (`member.user = user; member.joinStatus =
  'active';`), no duplicate created. The bug is specific to the direct join-link path, not the
  email-verification path — but the join-link is the more prominent, more likely-to-be-used path
  (it's the one in the invite email itself; email verification is a separate email most users
  won't specifically seek out unless told to).

**Recommended fix:** before creating a new `GroupMember` in `joinGroupByToken`'s "not found"
branch, also check for a Contact-backed row matching the joining user's verified email/phone (the
same lookup `claimContactsForUser` already does) and claim it in place rather than inserting a new
row. This is a scoped bug fix, not a refactor — do not generalize this into the broader
membership-resolution consolidation flagged in `docs/audits/groups-architecture-audit.md` P1-3
as part of fixing this.

### RB-2: Receipt attachments are stored in browser `localStorage`, not any real backend — silent, unbounded data loss risk

**Journey affected:** Add expense (with a receipt attachment).

`create-expense-modal.component.ts:492-493` writes every encrypted receipt directly to
`localStorage.setItem('sim_storage:' + storageKey, encryptedBytes)` with no try/catch around the
call. This is a development placeholder (`gap-tracker.md` ATT-001, confirmed still true) standing
in for the roadmap Supabase-backed attachment storage — it was never wired to a real backend.

**Concrete impact:**
- Receipts do not sync across devices or browsers — attach a receipt on your phone, it is invisible
  from your laptop.
- Receipts are lost the moment the browser's site data is cleared, in a private/incognito window,
  or in a different browser profile — with no warning to the user that this will happen.
- `localStorage` has a small per-origin quota (typically 5–10MB total, shared across everything the
  app stores there, including cached keys). A handful of receipt photos can plausibly exceed it;
  the unguarded `setItem` call would throw `QuotaExceededError` synchronously inside an `async`
  block with no surrounding `try/catch` at this call site — whether the *outer* submit handler
  catches and surfaces this was not traced further in this pass, but at minimum the attach
  succeeding at all is bounded by quota in a way nothing in the UI communicates.
- Nothing in the UI indicates that "attach receipt" is not really persisted — a user has no reason
  to expect this behaves differently from every other piece of data in the app, all of which is
  genuinely server-persisted and end-to-end encrypted.

**Recommended fix:** either wire receipts to real backend storage before shipping, or — if that's
out of scope for this release — put a visible, honest warning on the attachment UI ("Receipts are
stored locally on this device only and will be lost if you clear browser data") so the silent
data-loss becomes an informed tradeoff rather than a surprise.

## High

### H-1: No account recovery for a forgotten password

Confirmed still true (`gap-tracker.md` AUTH-002, re-verified this pass). `POST /auth/change-password`
exists (`auth.controller.ts:88-114`) but requires `JwtAuthGuard` — i.e. the user must already be
logged in and know their current password. There is no `forgot-password`/`reset-password` route on
the backend and no corresponding page in the frontend (confirmed via repo-wide search — not even a
dead link). A user who forgets their password has no self-service way back into their account.
Given FinMate's zero-knowledge design, full data recovery without the password is inherently
impossible by design — but at minimum, a "reset and start fresh" path (new master key, accept loss
of old encrypted data) is standard even for ZK apps and is absent here. Not a blocker for a single
disciplined user who manages their own password carefully; a real risk for any usage beyond that.

### H-2: `docs/audits/expense-audit.md`'s Low-priority settlement-note gap is real and unrelated to Groups fix

Carried over, not re-investigated this pass beyond confirming it's still Low/non-blocking per
`docs/EXPENSE_MODULE_FREEZE.md`. Listed here only so this report doesn't imply it was missed.

## Medium

### M-1: Several silent-failure fetches show a misleading "empty" state instead of an error state

`GroupDetailComponent.fetchHistoryLogs` (`:824`), `.fetchDeletedExpenses` (`:833`), and
`.fetchCarryForward` (`:842`) all handle fetch errors
with `error: (err) => console.error(...)` only — no error signal is set. On a network failure, the
user sees "No history logged yet" / an empty trash / empty carry-forward, indistinguishable from
those states being genuinely empty. `fetchBalances`, by contrast, does set a `balancesError` signal
on failure — the inconsistency itself suggests this is an oversight rather than intentional, not a
pattern applied deliberately.

### M-2: `spectator` role is locked out of member-list routes (GRP-003, confirmed still open)

A group member explicitly assigned the `spectator` role cannot view `GET /groups/:id/members` at
all (`group-roles.decorator.ts:3-5` type union omits `spectator`) — confirmed unchanged since
`docs/audits/groups-architecture-audit.md`. Only matters if the product actually exposes assigning
someone as `spectator` in the UI; if that role isn't reachable from any current UI flow, this is
latent rather than live.

### M-3: Invite links never expire; a departed member's group key is never revoked (GRP-004/005, confirmed still open)

Carried over from `docs/audits/groups-architecture-audit.md`, re-confirmed still true, not
re-traced line-by-line this pass. Relevant to "security issues" but requires a specific adversarial
scenario (a leaked old invite link, or a removed member retaining a cached key) rather than
affecting normal daily use.

### M-4: `canChangeRole()` UI stub always returns `true`

`group-detail.component.ts:1325-1328` — confirmed this session
(`docs/audits/groups-architecture-audit.md` P2-1). Every member, including viewers, sees a
role-change control for other members that will always be rejected by the backend on submit
(the backend check itself is correct and secure — this is a client-side UX gap, not a security
hole). Confusing, not dangerous.

## Low

- Group History shows a placeholder for entries encrypted under a superseded key after a group-key
  rotation (`KNOWN_ISSUES.md` KI-1). Already explicitly documented as non-release-blocking, and
  currently unreachable in practice since key rotation has no UI trigger yet.
- `Settlement.note` lacks `@IsCiphertext` validation (`expense-audit.md` finding, gap-tracker
  EXP-008) — a client could in principle persist a plaintext note; low practical exposure.
- `trip` group type is documented but not implemented (GRP-006) — pure doc drift, not a code issue.

## Recommended Fixes (priority order)

1. **RB-1** (join-link duplicate membership) — scoped fix: claim the existing Contact-backed row
   in `joinGroupByToken` instead of creating a new one. This is the single highest-value fix in
   this report — it corrupts real financial/membership data through the app's primary invite path.
2. **RB-2** (attachment storage) — either wire real storage or add an explicit warning label before
   shipping any flow that lets users attach receipts, so data loss is disclosed, not silent.
3. **H-1** (password recovery) — needed before relying on this for any account you can't guarantee
   never forgetting the password for.
4. **M-1** (silent-failure fetch states) — small, mechanical fix: set an error signal in the three
   methods that are missing one, matching the pattern `fetchBalances` already uses.
5. M-2/M-3/M-4 and the Low items — already tracked in existing audit docs; no new action implied by
   this pass beyond what's already recorded there.

## Final Recommendation

**NOT READY.**

The core personal-use path — register, log in, create a personal or group expense among people who
already have accounts, edit/delete, recurring expenses, settlements, carry forward, close month,
logout/refresh — is solid: well-tested (386 backend + 226 frontend tests passing), and this pass
found no crash or incorrect-balance risk in any of it.

What blocks a release recommendation is **RB-1**: the invite-and-join flow for anyone who doesn't
already have an account — very plausibly the single most common first action for a new household or
group user — silently corrupts membership data (role downgrade, orphaned history, fragmented
balances) on every occurrence, with zero user-visible indication anything went wrong. Given
group collaboration is this application's central feature (the large majority of this session's
work has been on group ledger, settlement, and carry-forward correctness), shipping with this bug
live means the first real multi-person use of the product is likely to produce silently wrong
financial data for the invited member.

**If group invites of not-yet-registered people are disabled or avoided** (e.g., only adding
people who already have FinMate accounts, which does work correctly via the `dto.userId`/direct-
lookup path in `inviteMember`), the personal/known-users-only subset of the product would meet
**Ready for Personal Daily Use**. That is a real, narrower option if RB-1 can't be fixed
immediately — but as shipped today, with the invite-link flow open to anyone, the recommendation
is **Not Ready**.
