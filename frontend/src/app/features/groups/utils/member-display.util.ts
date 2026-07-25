import { GroupMember } from '@finmate/data-models';

/**
 * Display name for a member, whichever identity backs it (registered user
 * or pending Contact). Shared by GroupDetailComponent and
 * GroupMembersComponent so member rendering can't diverge across the group
 * UI. See docs/audits/expense-architecture-audit.md (P2-3) for why this was
 * extracted.
 *
 * Note: unlike the backend's `resolveMemberDisplay` (settlements/carry
 * forward), this does not consult `GroupMember.nickname`. That is a
 * pre-existing gap between the backend and frontend resolvers, preserved
 * here rather than fixed, since closing it would change on-screen names —
 * see docs/changes/display-name-resolver-consolidation.md.
 */
export function resolveMemberDisplayName(member: GroupMember): string {
  return (
    member.user?.displayName ||
    member.user?.email ||
    member.contact?.displayName ||
    member.contact?.email ||
    'Pending Member'
  );
}

/**
 * Display name for a registered user by ID, looked up against a member
 * list. Only matches members backed by a registered `user` — pending/
 * contact-only members resolve to 'Unknown User'. Shared by
 * GroupDetailComponent and GroupBalancesComponent.
 */
export function resolveUserDisplayName(
  members: GroupMember[],
  userId: string | null | undefined,
): string {
  if (!userId) return 'Unknown User';
  const member = members.find((m) => m.user?.id === userId);
  return member?.user?.displayName || member?.user?.email || 'Unknown User';
}
