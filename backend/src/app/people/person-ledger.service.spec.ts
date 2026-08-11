import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import {
  DirectLedgerEntry,
  Expense,
  ExpensePayment,
  ExpenseSplit,
  Group,
  GroupMember,
  Settlement,
  User,
} from '@finmate/data-models';
import { PersonLedgerService } from './person-ledger.service';

/** Minimal user stub the way userRepository.findOne resolves it. */
const userStub = (id: string) => ({
  id,
  displayName: id,
  email: `${id}@example.com`,
});

describe('PersonLedgerService', () => {
  let service: PersonLedgerService;
  let groupMemberRepo: { find: jest.Mock };
  let expenseRepo: { find: jest.Mock };
  let splitRepo: { find: jest.Mock };
  let paymentRepo: { find: jest.Mock };
  let settlementRepo: { find: jest.Mock };
  let directRepo: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    softRemove: jest.Mock;
  };
  let userRepo: { findOne: jest.Mock };

  beforeEach(async () => {
    groupMemberRepo = { find: jest.fn().mockResolvedValue([]) };
    expenseRepo = { find: jest.fn().mockResolvedValue([]) };
    splitRepo = { find: jest.fn().mockResolvedValue([]) };
    paymentRepo = { find: jest.fn().mockResolvedValue([]) };
    settlementRepo = { find: jest.fn().mockResolvedValue([]) };
    directRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((d) => d),
      save: jest.fn(async (d) => ({ ...d, id: 'new-entry' })),
      softRemove: jest.fn(async (d) => d),
    };
    userRepo = {
      findOne: jest.fn(async ({ where }) => userStub(where.id)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PersonLedgerService,
        { provide: getRepositoryToken(GroupMember), useValue: groupMemberRepo },
        { provide: getRepositoryToken(Expense), useValue: expenseRepo },
        { provide: getRepositoryToken(ExpenseSplit), useValue: splitRepo },
        { provide: getRepositoryToken(ExpensePayment), useValue: paymentRepo },
        { provide: getRepositoryToken(Settlement), useValue: settlementRepo },
        { provide: getRepositoryToken(DirectLedgerEntry), useValue: directRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
      ],
    }).compile();

    service = module.get(PersonLedgerService);
  });

  describe('direct transactions', () => {
    it('lend normalises so the counterparty owes the caller', async () => {
      await service.createDirectTransaction('U1', 'U2', {
        entryType: 'lend',
        amount: 500,
        currency: 'USD',
        occurredOn: '2026-08-01',
      });
      const saved = directRepo.create.mock.calls[0][0];
      expect(saved.fromUser.id).toBe('U2'); // debtor
      expect(saved.toUser.id).toBe('U1'); // creditor (caller is owed)
      expect(saved.entryType).toBe('lend');
    });

    it('borrow normalises so the caller owes the counterparty', async () => {
      await service.createDirectTransaction('U1', 'U2', {
        entryType: 'borrow',
        amount: 300,
        currency: 'USD',
        occurredOn: '2026-08-01',
      });
      const saved = directRepo.create.mock.calls[0][0];
      expect(saved.fromUser.id).toBe('U1');
      expect(saved.toUser.id).toBe('U2');
    });

    it('rejects a transaction with oneself', async () => {
      await expect(
        service.createDirectTransaction('U1', 'U1', {
          entryType: 'lend',
          amount: 10,
          currency: 'USD',
          occurredOn: '2026-08-01',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('overview aggregation (direct-only)', () => {
    beforeEach(() => {
      // Two lends to the caller (U2 owes U1 800) and one borrow (U1 owes U3 200).
      directRepo.find.mockResolvedValue([
        {
          id: 'd1',
          fromUser: userStub('U2'),
          toUser: userStub('U1'),
          entryType: 'lend',
          amount: '500',
          currency: 'USD',
          occurredOn: '2026-08-01',
        },
        {
          id: 'd2',
          fromUser: userStub('U2'),
          toUser: userStub('U1'),
          entryType: 'lend',
          amount: '300',
          currency: 'USD',
          occurredOn: '2026-08-03',
        },
        {
          id: 'd3',
          fromUser: userStub('U1'),
          toUser: userStub('U3'),
          entryType: 'borrow',
          amount: '200',
          currency: 'USD',
          occurredOn: '2026-08-04',
        },
      ]);
    });

    it('computes totals, directions, and outstanding-first ordering', async () => {
      const overview = await service.getOverview('U1');
      expect(overview.totalYouAreOwed).toBe(800);
      expect(overview.totalYouOwe).toBe(200);
      expect(overview.people[0].counterpartyUserId).toBe('U2');
      expect(overview.people[0].netBalance).toBe(800);
      expect(overview.people[0].direction).toBe('owes_you');
      const u3 = overview.people.find((p) => p.counterpartyUserId === 'U3');
      expect(u3?.netBalance).toBe(-200);
      expect(u3?.direction).toBe('you_owe');
    });

    it('honours the limit for the dashboard widget', async () => {
      const overview = await service.getOverview('U1', 1);
      expect(overview.people).toHaveLength(1);
      expect(overview.people[0].counterpartyUserId).toBe('U2');
    });

    it('excludes household groups from the group aggregation', async () => {
      await service.getOverview('U1');
      const whereArg = groupMemberRepo.find.mock.calls[0][0].where;
      expect(whereArg.group.groupType).toBe('normal');
    });
  });

  describe('settlement ("Return")', () => {
    beforeEach(() => {
      // U2 owes the caller 400 (net +400).
      directRepo.find.mockResolvedValue([
        {
          id: 'd1',
          fromUser: userStub('U2'),
          toUser: userStub('U1'),
          entryType: 'lend',
          amount: '400',
          currency: 'USD',
          occurredOn: '2026-08-01',
        },
      ]);
    });

    it('rejects over-settlement beyond the outstanding balance', async () => {
      await expect(
        service.createDirectSettlement('U1', 'U2', {
          amount: 500,
          currency: 'USD',
          occurredOn: '2026-08-10',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('records a partial return in the correct direction', async () => {
      await service.createDirectSettlement('U1', 'U2', {
        amount: 200,
        currency: 'USD',
        occurredOn: '2026-08-10',
      });
      const saved = directRepo.create.mock.calls[0][0];
      // They owe you → they return money → from = counterparty, to = caller.
      expect(saved.entryType).toBe('settlement');
      expect(saved.fromUser.id).toBe('U2');
      expect(saved.toUser.id).toBe('U1');
    });

    it('rejects settling when nothing is outstanding', async () => {
      directRepo.find.mockResolvedValue([]);
      await expect(
        service.createDirectSettlement('U1', 'U2', {
          amount: 50,
          currency: 'USD',
          occurredOn: '2026-08-10',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('group per-expense pairwise obligations', () => {
    beforeEach(() => {
      groupMemberRepo.find.mockResolvedValue([
        { id: 'M1', group: { id: 'G1', name: 'Trip', groupType: 'normal' } },
      ]);
      // ₹6 expense, equal 3-way, paid entirely by caller (M1/U1).
      expenseRepo.find.mockResolvedValue([
        {
          id: 'E1',
          currency: 'USD',
          transactionType: 'expense',
          expenseDate: '2026-08-02',
          title: 'cipher-title',
          amountTotal: '6',
        },
      ]);
      paymentRepo.find.mockResolvedValue([
        {
          expense: { id: 'E1' },
          paidByGroupMember: { id: 'M1', user: userStub('U1') },
          amount: '6',
        },
      ]);
      splitRepo.find.mockResolvedValue([
        {
          expense: { id: 'E1' },
          participantGroupMember: { id: 'M1', user: userStub('U1') },
          amountOwed: '2',
        },
        {
          expense: { id: 'E1' },
          participantGroupMember: { id: 'M2', user: userStub('U2') },
          amountOwed: '2',
        },
        {
          expense: { id: 'E1' },
          participantGroupMember: { id: 'M3', user: userStub('U3') },
          amountOwed: '2',
        },
      ]);
    });

    it('derives that each other participant owes the payer their share', async () => {
      const detail = await service.getPersonDetail('U1', 'U2');
      expect(detail.netBalance).toBe(2);
      expect(detail.direction).toBe('owes_you');
      expect(detail.history).toHaveLength(1);
      expect(detail.history[0].source).toBe('group_expense');
      expect(detail.history[0].expenseId).toBe('E1');
      expect(detail.history[0].groupName).toBe('Trip');
      expect(detail.history[0].amount).toBe(2);
    });
  });

  describe('multiple payers on one expense (§7)', () => {
    beforeEach(() => {
      // Total 10; shares A=2 B=3 C=5; A paid 4, B paid 6, C paid 0.
      // Expected: C owes A 2 and C owes B 3.  Caller = A (M1/U1).
      groupMemberRepo.find.mockResolvedValue([
        { id: 'M1', group: { id: 'G1', name: 'Flat', groupType: 'normal' } },
      ]);
      expenseRepo.find.mockResolvedValue([
        {
          id: 'E1',
          currency: 'USD',
          transactionType: 'expense',
          expenseDate: '2026-08-05',
          title: 'cipher',
          amountTotal: '10',
        },
      ]);
      paymentRepo.find.mockResolvedValue([
        {
          expense: { id: 'E1' },
          paidByGroupMember: { id: 'M1', user: userStub('U1') },
          amount: '4',
        },
        {
          expense: { id: 'E1' },
          paidByGroupMember: { id: 'M2', user: userStub('U2') },
          amount: '6',
        },
      ]);
      splitRepo.find.mockResolvedValue([
        {
          expense: { id: 'E1' },
          participantGroupMember: { id: 'M1', user: userStub('U1') },
          amountOwed: '2',
        },
        {
          expense: { id: 'E1' },
          participantGroupMember: { id: 'M2', user: userStub('U2') },
          amountOwed: '3',
        },
        {
          expense: { id: 'E1' },
          participantGroupMember: { id: 'M3', user: userStub('U3') },
          amountOwed: '5',
        },
      ]);
    });

    it('attributes each payment so C owes A the overpaid remainder', async () => {
      const cToA = await service.getPersonDetail('U1', 'U3');
      expect(cToA.netBalance).toBe(2); // C owes A 2
      expect(cToA.direction).toBe('owes_you');

      // A and B both overpaid — no obligation between them.
      const aToB = await service.getPersonDetail('U1', 'U2');
      expect(aToB.netBalance).toBe(0);
    });
  });
});
