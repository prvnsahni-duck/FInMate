import { GroupMember } from '@finmate/data-models';

export interface MemberDisplay {
  groupMemberId: string;
  userId: string | null;
  contactId: string | null;
  displayName: string;
  email: string | null;
}

/**
 * Resolves a GroupMember to its display identity, whichever identity backs
 * it (registered user or pending Contact). Shared by SettlementsService
 * (suggested settlements / balances) and ExpensesService (Carry Forward
 * summary) so display names can't diverge between ledger surfaces. See
 * docs/audits/expense-architecture-audit.md (P2-3) for why this was
 * extracted.
 */
export function resolveMemberDisplay(m: GroupMember): MemberDisplay {
  if (m.user) {
    return {
      groupMemberId: m.id,
      userId: m.user.id,
      contactId: m.contact?.id ?? null,
      displayName: m.nickname || m.user.displayName || m.user.email,
      email: m.user.email,
    };
  }
  return {
    groupMemberId: m.id,
    userId: null,
    contactId: m.contact?.id ?? null,
    displayName:
      m.nickname || m.contact?.displayName || m.contact?.email || 'Unknown',
    email: m.contact?.email ?? null,
  };
}
