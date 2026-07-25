# Display Name Resolver Consolidation

Date: 2026-07-25
Source: `docs/audits/expense-architecture-audit.md`, finding P2-3 ("Member and display-name resolution is repeated in several layers").

## Objective

One canonical member display-name resolver per runtime: one backend resolver for API/DTO generation, one frontend resolver for UI rendering. No business-behavior or UI-text changes.

## Files Changed

| File                                                                                     | Change                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/src/app/common/member-display.util.ts`                                          | New. Canonical `resolveMemberDisplay(m: GroupMember): MemberDisplay` — registered-user vs. pending-Contact resolution, including `nickname` override.                                                                                                                |
| `backend/src/app/settlements/settlements.service.ts`                                     | Removed the local `MemberDisplay` interface and inlined resolution logic from `memberDisplay`; both now come from `member-display.util.ts`. `memberDisplay` stays as a thin private wrapper (unused by anything outside the class, so kept for call-site stability). |
| `backend/src/app/expenses/expenses.service.ts`                                           | `carryForwardMemberDisplay` now calls `resolveMemberDisplay` and destructures the 3 fields it exposes (`groupMemberId`, `userId`, `displayName`). Return type unchanged.                                                                                             |
| `frontend/src/app/features/groups/utils/member-display.util.ts`                          | New. Canonical `resolveMemberDisplayName(member)` and `resolveUserDisplayName(members, userId)` pure functions.                                                                                                                                                      |
| `frontend/src/app/features/groups/pages/group-detail/group-detail.component.ts`          | `getUserName` and `memberDisplayName` now delegate to the shared util. `payerDisplayName` is unchanged (it already composes `memberDisplayName`, so it inherits the shared resolver transitively — it wasn't itself duplicated anywhere).                            |
| `frontend/src/app/features/groups/components/group-balances/group-balances.component.ts` | `getUserName` now delegates to `resolveUserDisplayName`.                                                                                                                                                                                                             |
| `frontend/src/app/features/groups/components/group-members/group-members.component.ts`   | `memberDisplayName` now delegates to `resolveMemberDisplayName`.                                                                                                                                                                                                     |

Templates (`group-detail.component.html`, `group-members.component.html`) call `memberDisplayName(...)`/`getUserName(...)`/`payerDisplayName(...)` as component methods, which is why those methods are kept as thin wrappers rather than removed — Angular templates can't call a bare imported function. No template changed.

## Duplicate Implementations Removed

**Backend** — both built the same registered-vs-pending resolution inline:

- `SettlementsService.memberDisplay` (private method + local `MemberDisplay` interface)
- `ExpensesService.carryForwardMemberDisplay` (private method, inline return type)

**Frontend** — two distinct algorithms, each duplicated across two components:

- `memberDisplayName`: `GroupDetailComponent` and `GroupMembersComponent` (byte-for-byte identical bodies)
- `getUserName`: `GroupDetailComponent` and `GroupBalancesComponent` (byte-for-byte identical bodies)

`GroupDetailComponent.payerDisplayName` was not itself duplicated elsewhere — it's a payer-specific composition (`paidByUserId` → `paidByGroupMemberId` → `memberDisplayName`) unique to that component, so it was left as-is rather than extracted.

## Comparison

### Backend: `SettlementsService.memberDisplay` vs. `ExpensesService.carryForwardMemberDisplay`

| Case                        | Settlements                                                                   | Expenses (Carry Forward)                                | Match                  |
| --------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------- |
| Registered user             | `m.nickname \|\| m.user.displayName \|\| m.user.email`                        | same                                                    | ✅                     |
| Pending/contact-only member | `m.nickname \|\| m.contact?.displayName \|\| m.contact?.email \|\| 'Unknown'` | same                                                    | ✅                     |
| `groupMemberId`             | `m.id`                                                                        | same                                                    | ✅                     |
| `userId` (registered)       | `m.user.id`                                                                   | same                                                    | ✅                     |
| `userId` (pending)          | `null`                                                                        | same                                                    | ✅                     |
| `contactId`                 | `m.contact?.id ?? null`                                                       | _(not exposed — Carry Forward's DTO never included it)_ | Subset, not a conflict |
| `email`                     | `m.user.email` / `m.contact?.email ?? null`                                   | _(not exposed — same reason)_                           | Subset, not a conflict |

The two backend implementations were identical in every field they both exposed. `carryForwardMemberDisplay`'s return type was simply a narrower projection (3 of the 5 fields) of what is now `resolveMemberDisplay`'s full `MemberDisplay` shape — no behavioral difference, just an unused-field omission in the old duplicate.

### Frontend: `memberDisplayName` (`GroupDetailComponent` vs. `GroupMembersComponent`)

Identical bodies: `user.displayName || user.email || contact.displayName || contact.email || 'Pending Member'`. No differences found.

### Frontend: `getUserName` (`GroupDetailComponent` vs. `GroupBalancesComponent`)

Identical bodies: look up by `member.user?.id === userId`, return `user.displayName || user.email || 'Unknown User'`. No differences found. Note this resolver only matches registered users by user ID — pending/contact-only "members" never match (their `user` is undefined), so they always fall through to `'Unknown User'` here. That is pre-existing behavior in both call sites and was preserved verbatim, not a new gap introduced by this consolidation.

## Intentional Difference Discovered (Preserved, Not Fixed)

**Backend `resolveMemberDisplay` honors `GroupMember.nickname` as the top-priority override; the frontend resolvers do not consult `nickname` at all.**

- `GroupMember.nickname` (`shared/data-models/src/lib/group-member.entity.ts:42`) is described as "a purely cosmetic, per-group override of the Contact/User's display name," and both backend resolvers use it first: `m.nickname || ...`.
- Neither frontend `memberDisplayName` nor `getUserName` reference `member.nickname` anywhere in the codebase (confirmed via repo-wide search — `nickname` does not appear in `frontend/src`).
- This means: if a group member has a nickname set, backend-rendered surfaces (Carry Forward summaries, settlement suggestions) show it, while frontend-rendered surfaces (expense ledger payer name, member list, balances) do not.

This is a genuine backend/frontend divergence, but per the task's constraint ("no UI text changes," "no business behavior changes," "preserve current behavior unless it is a confirmed bug"), it was **not** fixed as part of this consolidation — doing so would change on-screen names for any group using nicknames. The frontend resolver was extracted to match current frontend behavior exactly (nickname-blind), and the gap is now documented in a comment on `resolveMemberDisplayName` in `member-display.util.ts` and here, rather than silently carried forward. Wiring the frontend to `member.nickname` would be a follow-up feature/bug-fix task, not a refactor.

## Canonical Backend Resolver

```ts
// backend/src/app/common/member-display.util.ts
export interface MemberDisplay {
  groupMemberId: string;
  userId: string | null;
  contactId: string | null;
  displayName: string;
  email: string | null;
}
export function resolveMemberDisplay(m: GroupMember): MemberDisplay;
```

A verbatim port of `SettlementsService.memberDisplay`'s body (the superset implementation). `SettlementsService.memberDisplay` and `ExpensesService.carryForwardMemberDisplay` are now thin wrappers over it.

## Canonical Frontend Resolver

```ts
// frontend/src/app/features/groups/utils/member-display.util.ts
export function resolveMemberDisplayName(member: GroupMember): string;
export function resolveUserDisplayName(members: GroupMember[], userId: string | null | undefined): string;
```

Pure functions, verbatim ports of the two duplicated method bodies. `GroupDetailComponent`, `GroupBalancesComponent`, and `GroupMembersComponent` now call these from their (unchanged-signature) component methods, which templates continue to bind against directly.

## Verification

- **One backend implementation**: `resolveMemberDisplay` is the only place registered-vs-pending display resolution is computed; both services' private methods are pass-through wrappers.
- **One frontend implementation**: `resolveMemberDisplayName`/`resolveUserDisplayName` are the only places those two algorithms are computed; all three components delegate.
- **No duplicated logic remains**: verified via repo search — no other inline copies of either algorithm exist in `backend/src/app` or `frontend/src/app/features/groups`.
- **No UI text changes**: frontend functions are byte-for-byte ports of the prior method bodies (same priority order, same fallback strings `'Pending Member'` / `'Unknown User'`).
- **No API changes**: backend resolver return shape (`MemberDisplay`) matches the prior `SettlementsService` local interface exactly; `ExpensesService.carryForwardMemberDisplay`'s narrower public return type is unchanged, just now backed by a shared implementation.
- **Existing tests pass**: no test previously covered these display-name methods directly (verified via search for `memberDisplayName`/`getUserName`/`payerDisplayName`/`memberDisplay`/`carryForwardMemberDisplay` in `*.spec.ts` — no matches); the full `settlements` and `expenses` backend suites, which exercise these methods indirectly through `calculateGroupBalances`/`getCarryForwardSummary`/`closeMonth`, pass unchanged.

## Test Results

```
Test Suites: 11 passed, 11 total
Tests:       142 passed, 142 total
```

Ran the full `backend/src/app/settlements` and `backend/src/app/expenses` suites (11 suites — settlements, expenses, expenses-carry-forward facade, recurring-expenses, controllers, DTOs, split-calculator, split-query-mapping). No test changes were needed.

`npx tsc --noEmit -p backend/tsconfig.app.json` and `npx tsc --noEmit -p frontend/tsconfig.app.json` both passed with no errors. `eslint` on all seven changed/added files produced 0 new errors or warnings — all remaining warnings (`@typescript-eslint/no-explicit-any`) are pre-existing and unrelated to these methods.

No frontend unit tests exist for `GroupDetailComponent`, `GroupBalancesComponent`, or `GroupMembersComponent` (verified via repo search for `*.spec.ts` under `frontend/src/app/features/groups`), so this change was verified via typecheck + lint; a manual UI pass is recommended before merge if higher confidence is needed.
