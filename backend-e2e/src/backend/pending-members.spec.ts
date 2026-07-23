import axios from 'axios';

/**
 * End-to-end coverage for Pending Members that genuinely needs a live
 * Postgres + running server — the concurrency/dedup guarantee (hardening
 * item A) is a database-level race that a mocked repository cannot exercise,
 * since mocks never actually serialize concurrent writes.
 *
 * NOTE: the full "register -> verify email -> historical data appears"
 * round trip is intentionally NOT covered here. The verification token is
 * emailed, not returned by any API response (by design — it must not be
 * guessable/interceptable via the HTTP surface), so a black-box e2e test has
 * no way to retrieve it. Exercising that path end-to-end would need either a
 * test-only "read the last verification token" backdoor gated behind
 * NODE_ENV=test, or an injectable email test-double in the e2e environment —
 * both are reasonable follow-ups but out of scope for this pass. The claim
 * logic itself (ContactsService.claimContactsForUser) is covered by unit
 * tests in contacts.service.spec.ts and auth.service.spec.ts.
 */
describe('Pending Members API End-to-End', () => {
  let token: string;
  let groupId: string;

  beforeAll(async () => {
    const email = `test-owner-${Date.now()}@finmate.local`;
    await axios.post('/api/auth/register', {
      email,
      password: 'Password123!',
      displayName: 'E2E Owner',
    });

    const resLogin = await axios.post('/api/auth/login', {
      email,
      password: 'Password123!',
    });
    token = resLogin.data.accessToken;

    const resGroup = await axios.post(
      '/api/groups',
      { name: 'E2E Pending Members Group', currency: 'USD' },
      { headers: { Authorization: `Bearer ${token}` } },
    );
    groupId = resGroup.data.id;
  });

  it('adds a non-registered person as a pending, Contact-backed member', async () => {
    const email = `rahul-${Date.now()}@finmate.local`;

    const res = await axios.post(
      `/api/groups/${groupId}/members`,
      { email, displayName: 'Rahul', role: 'member' },
      { headers: { Authorization: `Bearer ${token}` } },
    );

    expect(res.status).toBe(201);
    expect(res.data.data.memberType).toBe('contact');

    const membersRes = await axios.get(`/api/groups/${groupId}/members`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const added = membersRes.data.data.find(
      (m: any) => m.email === email || m.role === 'member',
    );
    expect(added).toBeDefined();
    expect(added.memberType).toBe('contact');
  });

  it('never creates a duplicate Contact under concurrent identical add-member requests (hardening item A)', async () => {
    const email = `race-${Date.now()}@finmate.local`;

    const [resA, resB] = await Promise.allSettled([
      axios.post(
        `/api/groups/${groupId}/members`,
        { email, displayName: 'Race Contact', role: 'member' },
        { headers: { Authorization: `Bearer ${token}` } },
      ),
      axios.post(
        `/api/groups/${groupId}/members`,
        { email, displayName: 'Race Contact', role: 'member' },
        { headers: { Authorization: `Bearer ${token}` } },
      ),
    ]);

    // Exactly one of the two concurrent requests succeeds; the other must
    // fail with "already a member" (the GroupMember unique constraint on
    // (group, contact) rejects the second row for the same resolved
    // Contact) — not silently create a second, duplicate Contact.
    const succeeded = [resA, resB].filter(
      (r) => r.status === 'fulfilled' && (r as any).value.status === 201,
    );
    const conflicted = [resA, resB].filter(
      (r) =>
        r.status === 'rejected' &&
        (r as any).reason?.response?.status === 409,
    );
    expect(succeeded.length).toBe(1);
    expect(conflicted.length).toBe(1);

    // And the member list shows exactly one entry for this email — not two.
    const membersRes = await axios.get(`/api/groups/${groupId}/members`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const matches = membersRes.data.data.filter((m: any) => m.email === email);
    expect(matches.length).toBe(1);
  });

  it('lets a pending member fully participate in an expense as a split participant', async () => {
    const email = `dinner-guest-${Date.now()}@finmate.local`;
    const addRes = await axios.post(
      `/api/groups/${groupId}/members`,
      { email, displayName: 'Dinner Guest', role: 'member' },
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const pendingMemberId = addRes.data.data.member.id;

    const ownerMembersRes = await axios.get(`/api/groups/${groupId}/members`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const ownerMember = ownerMembersRes.data.data.find(
      (m: any) => m.role === 'owner',
    );

    const expenseRes = await axios.post(
      '/api/expenses',
      {
        title: 'E2E Dinner with pending guest',
        amountTotal: 40,
        currency: 'USD',
        category: 'Food',
        groupId,
        paidByGroupMemberId: ownerMember.id,
        expenseDate: '2026-07-20',
        splits: [
          {
            participantGroupMemberId: ownerMember.id,
            splitType: 'equal',
            shareValue: 1,
          },
          {
            participantGroupMemberId: pendingMemberId,
            splitType: 'equal',
            shareValue: 1,
          },
        ],
      },
      { headers: { Authorization: `Bearer ${token}` } },
    );

    expect(expenseRes.status).toBe(201);
    const pendingSplit = expenseRes.data.data.splits.find(
      (s: any) => s.participantGroupMemberId === pendingMemberId,
    );
    expect(pendingSplit).toBeDefined();
    expect(pendingSplit.amountOwed).toBe(20);
  });
});
