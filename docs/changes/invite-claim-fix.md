# Invite-Claim Fix: Duplicate GroupMember on Join

Date: 2026-07-25
Source: `docs/release/RC1_READINESS.md` RB-1 ("Joining a group via invite link duplicates the
membership instead of claiming it — silent role downgrade and balance/history fragmentation").

## Objective

Fix `GroupsService.joinGroupByToken` so that a person invited by email/phone before they had a
FinMate account — a Contact-backed, pending `GroupMember` row — is correctly claimed when they
later register and join via the invite link, instead of getting a second, duplicate `GroupMember`
row with their role reset to `'member'`.

## Investigation: The Complete Flow

Traced end to end, from invite creation through acceptance:

1. **Invite creation** (`GroupsService.inviteMember`, `groups.service.ts:499-718`): resolves the
   target by `dto.userId`/`dto.identifier`/`dto.email` against existing `User` rows first. If none
   match, it calls `ContactsService.resolveOrCreateIdentity` (`groups.service.ts:566-577`), which
   creates a **pending `Contact`** — never a shadow `User` (confirmed: no shadow-user creation code
   path exists anywhere in the current codebase). The new `GroupMember` row is created with
   `contact` set, `user` left `undefined`, and `joinStatus: 'invited'`
   (`groups.service.ts:613-622`).
2. **Invite token validation**: for a Contact-backed invitee, `inviteMember`'s durable-`GroupInvite`
   branch never runs — that branch is gated on `targetUser` being resolved
   (`if (dto.wrappedGroupKey && targetUser)`, `groups.service.ts:626`), which is never true for a
   Contact. So the invite email always links to the group's permanent `group.inviteToken`
   (`groups.service.ts:682`), not a personalized, per-invitee token.
3. **Registration**: `UsersService.createUser` (`users.service.ts:26-58`) only rejects if a `User`
   row already exists for that email — a Contact row never collides with it, so registration
   itself was never broken.
4. **Invitation acceptance / GroupMember creation** — **this is where the bug was**:
   `GroupsService.joinGroupByToken` (`groups.service.ts:1172-1274` before this fix) resolves
   `existingMember` with a query filtered to `member.user_id = :userId` only
   (previously at `groups.service.ts:1219-1223`). The Contact-backed row from step 1 has
   `user_id = NULL`, so this query always missed it. Falling into the "not found" branch
   (previously `groups.service.ts:1246-1254`), the code unconditionally created a **new**
   `GroupMember` row with **`role` hardcoded to `'member'`** — regardless of what role the person
   was actually invited with — leaving the original Contact-backed row orphaned in the database.
5. **`ContactsService` claim/merge**: `ContactsService.claimContactsForUser`
   (`contacts.service.ts:271-320`) already existed and already does this correctly — it matches
   pending `Contact` rows by the user's email/phone, marks them `claimed`, and **updates the
   existing** `GroupMember` row in place (`member.user = user; member.joinStatus = 'active';`,
   `contacts.service.ts:305-309`) rather than creating a new one. But it was only ever called from
   one place: `AuthService.verifyEmail` (`auth.service.ts:167`), triggered by clicking a *separate*
   "verify your email" link — not by the invite-link join flow at all.
6. **`GroupInvite` updates**: `claimContactsForUser` also updates any `GroupInvite` rows tied to the
   claimed `Contact` (`contacts.service.ts:313-315`). In the current codebase `GroupInvite.contact`
   is never actually populated by either invite-creation path (`inviteMember`'s compatibility
   branch and `createGroupInvite` both only set `inviteeUser`, never `contact`) — so this part of
   `claimContactsForUser` is inert today. That's a pre-existing, narrower gap unrelated to the
   duplicate-`GroupMember` bug this fix addresses; see Remaining Follow-Up Work.
7. **History**: `Expense`/`ExpenseSplit`/`Settlement` rows reference a group member by
   `GroupMember.id`. Since the bug created a second row with a new `id` instead of reusing the
   original, any history already attached to the Contact-backed row's `id` (e.g. an expense the
   owner logged with the not-yet-registered person as a participant) stayed attached to the now
   orphaned row — invisible from the perspective of the new row the person actually ended up using.

**Root cause, in one sentence:** `joinGroupByToken` had no path that resolved a joining user's
*Contact-backed* pending membership — only `AuthService.verifyEmail` did, via a completely
separate, optional step most users have no specific reason to trigger before clicking the more
prominent "join this group" link in their invite email.

## The Fix

One call, inserted at the point in `joinGroupByToken` where the join flow already resolves the
authenticated `User` — before it queries for an existing `user`-linked membership:

```ts
// backend/src/app/groups/groups.service.ts
const user = await this.dataSource
  .getRepository(User)
  .findOne({ where: { id: userId } });
if (!user) {
  throw new NotFoundException('User not found');
}

await this.contactsService.claimContactsForUser(user);   // ← the fix

const existingMember = await this.groupMemberRepository
  .createQueryBuilder('member')
  .where('member.group_id = :groupId', { groupId: group.id })
  .andWhere('member.user_id = :userId', { userId })
  .getOne();
```

This reuses `ContactsService.claimContactsForUser` — the same method `AuthService.verifyEmail`
already calls — rather than introducing new claim logic. `GroupsService` already injects
`ContactsService` (it was already used for `resolveOrCreateIdentity` in `inviteMember`), so no
module wiring changed. If the joining user has a pending Contact-backed membership for this group
(or any group, matching the existing, already-shipped behavior of the email-verification claim
path), it gets linked and activated *before* `joinGroupByToken`'s own `existingMember` lookup runs
— so that lookup now finds the just-linked row instead of finding nothing and creating a duplicate.
Calling it is safe unconditionally: it only touches `Contact` rows with `status: 'pending'`, so a
user with no pending contacts, or one who already verified their email earlier, gets a harmless
no-op.

No API response shape changed — `joinGroupByToken` still returns
`{ member, wrappedGroupKey, groupKeyVersionId, groupKeyVersion, groupId }`. No DTOs changed.
`updateMember`'s self-accept path and `getInviteDetails` were investigated and left untouched —
neither is on the path that creates the duplicate (see Investigation steps 2 and 4); changing them
was unnecessary and out of scope.

## Files Changed

| File | Change |
| --- | --- |
| `backend/src/app/groups/groups.service.ts` | One-line fix (plus explanatory comment) in `joinGroupByToken`: call `this.contactsService.claimContactsForUser(user)` before the existing-membership query. |
| `backend/src/app/groups/groups.service.spec.ts` | Added `claimContactsForUser` to the `ContactsService` mock (defaults to a safe no-op so all pre-existing tests are unaffected); added a new `describe('joinGroupByToken', ...)` block with 8 regression tests covering the scenarios below. |

## Duplicate Implementations Removed

None. This was a correctness bug (a missing call), not a duplicated implementation — the correct
claim logic already existed in `ContactsService.claimContactsForUser` and needed to be reused from
a second call site, not consolidated from multiple copies.

## Behavioral Comparison

| Scenario | Before | After |
| --- | --- | --- |
| Contact-backed invitee registers, then joins via invite link | New duplicate `GroupMember` row created; role reset to `'member'`; original row (and any history attached to it) orphaned | Existing Contact-backed row claimed in place (`user` set, `joinStatus: 'active'`); same `id`, same `role` as originally invited; no new row |
| User-backed invitee (resolved directly at invite time) joins via invite link | Found by `user_id`, activated in place | Unchanged — still found by `user_id`, activated in place (claim call is a no-op here since there's no pending Contact to match) |
| Authenticated user joins a group cold via its permanent link, with no prior invite of any kind | New `GroupMember` row created, role `'member'` | Unchanged — claim call finds nothing to claim, falls through to the same "create new member" path as before |

## Verification Results

**Scenarios from the task's Verify list**, each covered by a dedicated regression test in
`groups.service.spec.ts` → `describe('joinGroupByToken', ...)`:

- ✅ **Existing user accepts invite** — `'activates an already-active-track existing user
  membership in place — no duplicate, role preserved (regression: already-working path)'`
- ✅ **Pending contact accepts invite** / **invited email registers before accepting** —
  `'claims the existing Contact-backed membership instead of creating a duplicate, for an invitee
  who registered before accepting'`
- ✅ **Invited email registers during acceptance** — `'calls claimContactsForUser before resolving
  existing membership, so a not-yet-linked Contact-backed row is claimed within the same join call
  (covers registering during acceptance)'`; asserts `claimContactsForUser`'s mock invocation order
  is strictly before the existing-membership query's invocation order.
- ✅ **Admin / member / spectator invitation** — parametrized test, `'preserves the %s role granted
  at invite time when a Contact-backed invitee joins'`, run for all three roles.
- ✅ **Preserves historical expenses and balances / no orphaned history** — `'preserves the original
  GroupMember id when claiming a Contact-backed invitee, so history already attached to it
  (expenses, splits, settlements) stays correctly linked'` (history correctness reduces to id
  preservation, since `Expense`/`ExpenseSplit`/`Settlement` reference members by
  `GroupMember.id` — this is the level `GroupsService`'s own tests can and should verify;
  cross-module balance math is `ExpensesService`/`SettlementsService`'s own, already-covered
  responsibility).
- ✅ **No duplicate memberships** — every claim-path test asserts
  `groupMemberRepository.create` was **not** called; the cold-join regression test asserts it
  **was** called, confirming the assertion actually distinguishes the two paths.

**Non-tautology check**: before finalizing, the fix was temporarily reverted
(`git stash push -- .../groups.service.ts`) and the full spec file re-run. 8 of the new tests
failed exactly as expected (the ones asserting `claimContactsForUser` was called, or relying on its
effect), confirming these tests actually exercise the fix rather than passing regardless of it. The
fix was then restored and the suite re-verified green.

**Full verification, run fresh**:

```
Backend full suite:  29 suites / 394 tests passed  (386 pre-existing + 8 new)
tsc --noEmit:        clean, 0 errors
eslint (changed files): 0 errors, 96 pre-existing warnings (@typescript-eslint/no-explicit-any /
                        no-non-null-assertion), 0 new
```

No frontend changes were needed — `join-group.component.ts` already just calls the backend's join
endpoint and trusts its response; the bug and its fix are entirely server-side.

## Confirmation: No Unrelated Behavior Changed

- API response shape of `POST /groups/join/:inviteToken`: unchanged.
- `updateMember`, `removeMember`, `inviteMember`, `getInviteDetails`, `createGroupInvite`: untouched.
- `ContactsService.claimContactsForUser`: untouched — reused as-is, not modified.
- No new abstraction was introduced; no existing duplication was consolidated. This is a single
  added call to an existing, already-tested method.

## Remaining Follow-Up Work

- **`GroupInvite.contact` is still never populated** by either invite-creation path
  (`inviteMember`'s compatibility branch, `createGroupInvite`). This means the portion of
  `claimContactsForUser` that updates `GroupInvite` rows by contact
  (`contacts.service.ts:313-315`) remains inert. This was flagged independently in
  `docs/audits/groups-architecture-audit.md` P1-6 as a narrower, separate issue (it affects
  `ContactsService`'s own claim/merge bookkeeping for durable invite records, not `GroupMember`
  correctness) and is out of scope for this fix.
- **No live E2E coverage was added.** `backend-e2e/src/backend/pending-members.spec.ts` already
  covers Contact-backed member creation against a real server/Postgres, but its own comment notes
  the full "register → verify email → historical data appears" round trip is intentionally not
  covered there (the verification token isn't retrievable via HTTP by design). The join-by-link
  path this fix touches *is* reachable via a normal HTTP call with no such obstacle — adding an
  E2E test exercising "Contact-backed invite → register → `POST /groups/join/:token` → single
  member, correct role" against a live server would be a reasonable follow-up for higher-confidence
  coverage, but was not added here since this codebase's own convention (per that file's comment)
  treats the claim logic's correctness as adequately covered by unit tests once the integration
  point is also unit-tested — which this change does.
