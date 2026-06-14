import axios from 'axios';

describe('Expenses API End-to-End', () => {
  let token: string;
  let userId: string;
  let groupId: string;
  let expenseId: string;
  let expenseVersion: number;

  beforeAll(async () => {
    // 1. Register a new test user
    const email = `test-user-${Date.now()}@finmate.local`;
    const resAuth = await axios.post('/api/auth/register', {
      email,
      password: 'Password123!',
      displayName: 'E2E User'
    });
    
    // Login to get token
    const resLogin = await axios.post('/api/auth/login', {
      email,
      password: 'Password123!'
    });
    token = resLogin.data.accessToken;

    // Decode token or get from register res if it returns user
    // (Assuming backend returns user object on register)
    userId = resAuth.data.id;

    // 2. Create a test group
    const resGroup = await axios.post('/api/groups', {
      name: 'E2E Expenses Group',
      currency: 'USD'
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    groupId = resGroup.data.id;
  });

  it('should create an expense', async () => {
    const res = await axios.post('/api/expenses', {
      title: 'E2E Dinner',
      amountTotal: 100,
      currency: 'USD',
      category: 'Food',
      groupId,
      expenseDate: '2026-06-15',
      status: 'posted',
      splits: [
        {
          participantUserId: userId,
          amountOwed: 100,
          splitType: 'equal'
        }
      ]
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    expect(res.status).toBe(201);
    expect(res.data).toHaveProperty('id');
    expect(res.data.title).toBe('E2E Dinner');
    expect(res.data.amountTotal).toBe(100);
    
    expenseId = res.data.id;
    expenseVersion = res.data.version;
  });

  it('should list expenses', async () => {
    const res = await axios.get(`/api/expenses?groupId=${groupId}&category=Food`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    expect(res.status).toBe(200);
    expect(res.data.data.length).toBeGreaterThan(0);
    expect(res.data.data[0].id).toBe(expenseId);
  });

  it('should get expense details', async () => {
    const res = await axios.get(`/api/expenses/${expenseId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    expect(res.status).toBe(200);
    expect(res.data.id).toBe(expenseId);
    expect(res.data.splits).toBeDefined();
    expect(res.data.splits[0].amountOwed).toBe(100);
  });

  it('should update an expense', async () => {
    const res = await axios.patch(`/api/expenses/${expenseId}`, {
      title: 'E2E Dinner Updated',
      version: expenseVersion
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    expect(res.status).toBe(200);
    expect(res.data.title).toBe('E2E Dinner Updated');
  });

  it('should fail update with version conflict', async () => {
    try {
      await axios.patch(`/api/expenses/${expenseId}`, {
        title: 'Conflict',
        version: expenseVersion // already incremented by previous test
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fail('Expected version conflict');
    } catch (e: any) {
      expect(e.response.status).toBe(412); // Precondition Failed
    }
  });

  it('should void the posted expense', async () => {
    const res = await axios.delete(`/api/expenses/${expenseId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    expect(res.status).toBe(204);

    // Verify it is voided
    const detail = await axios.get(`/api/expenses/${expenseId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(detail.data.status).toBe('void');
  });
});
