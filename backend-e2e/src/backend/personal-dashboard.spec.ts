import axios from 'axios';

/**
 * Regression coverage for the "Personal Dashboard projection" bug:
 * listMyExpenses() and getCombinedMonthlyAnalytics() previously filtered
 * ExpenseSplit rows with a malformed raw QueryBuilder condition
 * (`split.participantUserId`), which TypeORM could not translate to a real
 * column. That made GET /expenses/me and GET /expenses/analytics/all-monthly
 * fail with a 500 on every call, so a group expense's ExpenseSplit rows were
 * created correctly but never reached either participant's dashboard.
 *
 * These tests exercise the full flow against a real server + real Postgres:
 * two independent users, a shared group, one group expense split between
 * them, and both users independently reading /expenses/me and
 * /expenses/analytics/all-monthly. They assert the *projection* — no new
 * Expense row is created per participant; both users see the same expense
 * id, each with their own `myShare` derived from their own ExpenseSplit row.
 */
describe('Personal Dashboard projection (group expense shares)', () => {
  let creatorToken: string;
  let creatorId: string;
  let participantToken: string;
  let participantId: string;
  let groupId: string;
  let inviteToken: string;
  let expenseId: string;
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  const expenseDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  async function registerAndLogin(label: string) {
    const email = `pd-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@finmate.local`;
    const password = 'Password123!';

    const registerRes = await axios.post('/api/auth/register', {
      email,
      password,
      displayName: `PD ${label}`,
    });
    const userId = registerRes.data.data.id;

    const loginRes = await axios.post('/api/auth/login', { email, password });
    const token = loginRes.data.data.accessToken;

    return { userId, token };
  }

  beforeAll(async () => {
    const creator = await registerAndLogin('creator');
    creatorId = creator.userId;
    creatorToken = creator.token;

    const participant = await registerAndLogin('participant');
    participantId = participant.userId;
    participantToken = participant.token;

    // Creator creates the shared group.
    const groupRes = await axios.post(
      '/api/groups',
      { name: 'PD Test Group', currency: 'USD' },
      { headers: { Authorization: `Bearer ${creatorToken}` } },
    );
    groupId = groupRes.data.data.id;
    inviteToken = groupRes.data.data.inviteToken;

    // Participant joins via the group's invite token (self-service, becomes
    // an active member immediately).
    await axios.post(
      `/api/groups/join/${inviteToken}`,
      {},
      { headers: { Authorization: `Bearer ${participantToken}` } },
    );

    // Creator posts a single group expense split equally between both members.
    const expenseRes = await axios.post(
      '/api/expenses',
      {
        title: 'PD Shared Dinner',
        amountTotal: 1000,
        currency: 'USD',
        category: 'Food & Drinks',
        paidByUserId: creatorId,
        groupId,
        expenseDate,
        status: 'posted',
        splits: [
          { participantUserId: creatorId, shareValue: 1, splitType: 'equal' },
          {
            participantUserId: participantId,
            shareValue: 1,
            splitType: 'equal',
          },
        ],
      },
      { headers: { Authorization: `Bearer ${creatorToken}` } },
    );
    expenseId = expenseRes.data.data.id;
  });

  it("appears in the creator's personal dashboard as a GROUP_SHARE with the correct myShare", async () => {
    const res = await axios.get('/api/expenses/me', {
      headers: { Authorization: `Bearer ${creatorToken}` },
    });

    expect(res.status).toBe(200);
    const items: any[] = res.data.data.data;
    const item = items.find((i) => i.id === expenseId);

    expect(item).toBeDefined();
    expect(item.expenseType).toBe('GROUP_SHARE');
    expect(item.groupId).toBe(groupId);
    expect(Number(item.myShare)).toBe(500);
    expect(Number(item.amountTotal)).toBe(1000);
  });

  it("appears in the other participant's personal dashboard as a GROUP_SHARE with the correct myShare", async () => {
    const res = await axios.get('/api/expenses/me', {
      headers: { Authorization: `Bearer ${participantToken}` },
    });

    expect(res.status).toBe(200);
    const items: any[] = res.data.data.data;
    const item = items.find((i) => i.id === expenseId);

    expect(item).toBeDefined();
    expect(item.expenseType).toBe('GROUP_SHARE');
    expect(item.groupId).toBe(groupId);
    expect(Number(item.myShare)).toBe(500);
  });

  it('does not create a duplicate Expense row for the second participant', async () => {
    const creatorRes = await axios.get('/api/expenses/me', {
      headers: { Authorization: `Bearer ${creatorToken}` },
    });
    const participantRes = await axios.get('/api/expenses/me', {
      headers: { Authorization: `Bearer ${participantToken}` },
    });

    const creatorMatches = (creatorRes.data.data.data as any[]).filter(
      (i) => i.id === expenseId,
    );
    const participantMatches = (participantRes.data.data.data as any[]).filter(
      (i) => i.id === expenseId,
    );

    // Same single expense id surfaces for both users — never duplicated.
    expect(creatorMatches).toHaveLength(1);
    expect(participantMatches).toHaveLength(1);
  });

  it("includes the participant's group share in combined monthly analytics", async () => {
    const res = await axios.get(
      `/api/expenses/analytics/all-monthly?month=${month}`,
      { headers: { Authorization: `Bearer ${participantToken}` } },
    );

    expect(res.status).toBe(200);
    const categories: { category: string; amount: number }[] = res.data.data;
    const food = categories.find((c) => c.category === 'Food & Drinks');

    expect(food).toBeDefined();
    expect(Number(food!.amount)).toBeGreaterThanOrEqual(500);
  });
});
