import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  RecurringExpense,
  RecurringExpenseSplit,
  Expense,
  ExpenseSplit,
  Group,
  GroupMember,
  GroupKeyVersion,
  User,
} from '@finmate/data-models';
import { DataSource, LessThanOrEqual } from 'typeorm';
import { RecurringExpensesService } from './recurring-expenses.service';
import { RecurringExpensesScheduler } from './recurring-expenses.scheduler';

import { RedisService } from '../../redis/redis.service';

describe('RecurringExpenses Service & Scheduler', () => {
  let service: RecurringExpensesService;
  let scheduler: RecurringExpensesScheduler;

  const mockRedisService = {
    setNx: jest.fn().mockResolvedValue(true),
  };

  const mockUserRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
  };
  const mockGroupRepo = {
    findOne: jest.fn(),
  };
  const mockGroupMemberRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
  };
  const mockRecurringExpenseRepo = {
    create: jest.fn((x) => x),
    save: jest.fn((x) => Promise.resolve({ id: 'template-id', ...x })),
    findOne: jest.fn(),
    find: jest.fn(),
    delete: jest.fn(),
  };
  const mockRecurringExpenseSplitRepo = {
    create: jest.fn((x) => x),
    save: jest.fn((x) => Promise.resolve({ id: 'split-id', ...x })),
    find: jest.fn(),
    delete: jest.fn(),
  };
  const mockExpenseRepo = {
    create: jest.fn((x) => x),
    save: jest.fn((x) => Promise.resolve({ id: 'expense-id', ...x })),
  };
  const mockExpenseSplitRepo = {
    create: jest.fn((x) => x),
    save: jest.fn((x) => Promise.resolve({ id: 'split-id', ...x })),
  };
  const mockGroupKeyVersionRepo = {
    findOne: jest.fn(),
    save: jest.fn((x) => Promise.resolve({ id: 'gkv-id', ...x })),
    create: jest.fn((x) => x),
  };

  const mockTransactionManager = {
    getRepository: jest.fn((entity) => {
      if (entity === RecurringExpense) return mockRecurringExpenseRepo;
      if (entity === RecurringExpenseSplit)
        return mockRecurringExpenseSplitRepo;
      if (entity === Expense) return mockExpenseRepo;
      if (entity === ExpenseSplit) return mockExpenseSplitRepo;
      if (entity === User) return mockUserRepo;
      if (entity === GroupMember) return mockGroupMemberRepo;
      if (entity === GroupKeyVersion) return mockGroupKeyVersionRepo;
      return null;
    }),
  };

  const mockDataSource = {
    transaction: jest.fn((cb) => cb(mockTransactionManager)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecurringExpensesService,
        RecurringExpensesScheduler,
        { provide: RedisService, useValue: mockRedisService },
        { provide: DataSource, useValue: mockDataSource },
        {
          provide: getRepositoryToken(RecurringExpense),
          useValue: mockRecurringExpenseRepo,
        },
        {
          provide: getRepositoryToken(RecurringExpenseSplit),
          useValue: mockRecurringExpenseSplitRepo,
        },
        { provide: getRepositoryToken(Expense), useValue: mockExpenseRepo },
        {
          provide: getRepositoryToken(ExpenseSplit),
          useValue: mockExpenseSplitRepo,
        },
        { provide: getRepositoryToken(Group), useValue: mockGroupRepo },
        {
          provide: getRepositoryToken(GroupMember),
          useValue: mockGroupMemberRepo,
        },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
      ],
    }).compile();

    service = module.get<RecurringExpensesService>(RecurringExpensesService);
    scheduler = module.get<RecurringExpensesScheduler>(
      RecurringExpensesScheduler,
    );
  });

  describe('RecurringExpensesService CRUD', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should create personal recurring expense template', async () => {
      const ownerUser = { id: 'user-owner' };
      const paidByUser = { id: 'user-owner' };

      mockUserRepo.findOne.mockResolvedValueOnce(ownerUser); // owner
      mockUserRepo.findOne.mockResolvedValueOnce(paidByUser); // paidBy
      mockUserRepo.find.mockResolvedValueOnce([ownerUser]);

      mockRecurringExpenseRepo.findOne.mockResolvedValue({
        id: 'template-id',
        title: 'Subscription',
        amountTotal: 100,
        currency: 'USD',
        paidByUser,
        ownerUser,
        frequency: 'monthly',
        startDate: '2026-06-23',
        nextOccurrenceDate: '2026-06-23',
        status: 'active',
      });

      mockRecurringExpenseSplitRepo.find.mockResolvedValue([
        {
          id: 'split-1',
          participantUser: ownerUser,
          splitType: 'equal',
          shareValue: 1,
          amountOwed: 100,
        },
      ]);

      const result = await service.createRecurringExpense('user-owner', {
        title: 'Subscription',
        amountTotal: 100,
        currency: 'USD',
        category: 'bills',
        paidByUserId: 'user-owner',
        frequency: 'monthly',
        startDate: '2026-06-23',
        splits: [
          {
            participantUserId: 'user-owner',
            splitType: 'equal',
            shareValue: 1,
          },
        ],
      });

      expect(result.id).toBe('template-id');
      expect(result.amountTotal).toBe(100);
      expect(result.splits).toHaveLength(1);
      expect(mockRecurringExpenseRepo.save).toHaveBeenCalled();
    });

    it('Option A: generates today’s occurrence immediately when the start date is today', async () => {
      jest.useFakeTimers({ now: new Date('2026-06-20T12:00:00Z') });
      const ownerUser = { id: 'user-owner' };
      mockUserRepo.findOne.mockResolvedValueOnce(ownerUser); // owner
      mockUserRepo.findOne.mockResolvedValueOnce(ownerUser); // paidBy
      mockUserRepo.find.mockResolvedValueOnce([ownerUser]);

      mockRecurringExpenseRepo.findOne.mockResolvedValue({
        id: 'template-id',
        title: 'Daily Coffee',
        amountTotal: 5,
        currency: 'USD',
        category: 'food',
        paidByUser: ownerUser,
        ownerUser,
        frequency: 'daily',
        startDate: '2026-06-20',
        nextOccurrenceDate: '2026-06-20',
        status: 'active',
      });
      mockRecurringExpenseSplitRepo.find.mockResolvedValue([
        {
          id: 'split-1',
          participantUser: ownerUser,
          splitType: 'equal',
          shareValue: 1,
          amountOwed: 5,
        },
      ]);

      const result = await service.createRecurringExpense('user-owner', {
        title: 'Daily Coffee',
        amountTotal: 5,
        currency: 'USD',
        category: 'food',
        paidByUserId: 'user-owner',
        frequency: 'daily',
        startDate: '2026-06-20',
        splits: [
          {
            participantUserId: 'user-owner',
            splitType: 'equal',
            shareValue: 1,
          },
        ],
      });

      // Exactly one ledger Expense materialized for today, via the scheduler's
      // shared routine — no second generation path.
      expect(mockExpenseRepo.create).toHaveBeenCalledTimes(1);
      expect(mockExpenseRepo.save).toHaveBeenCalledTimes(1);
      const createdExpense = mockExpenseRepo.create.mock.calls[0][0];
      expect(createdExpense.expenseDate).toBe('2026-06-20');
      expect(createdExpense.status).toBe('posted');
      expect(result.firstOccurrenceGenerated).toBe(true);
      // Daily → nextOccurrenceDate advanced past today (prevents duplicates).
      expect(result.nextOccurrenceDate).toBe('2026-06-21');

      jest.useRealTimers();
    });

    it('Option A: creates template only (no occurrence) when the start date is in the future', async () => {
      jest.useFakeTimers({ now: new Date('2026-06-20T12:00:00Z') });
      const ownerUser = { id: 'user-owner' };
      mockUserRepo.findOne.mockResolvedValueOnce(ownerUser);
      mockUserRepo.findOne.mockResolvedValueOnce(ownerUser);
      mockUserRepo.find.mockResolvedValueOnce([ownerUser]);

      mockRecurringExpenseRepo.findOne.mockResolvedValue({
        id: 'template-id',
        title: 'Future Sub',
        amountTotal: 5,
        currency: 'USD',
        category: 'bills',
        paidByUser: ownerUser,
        ownerUser,
        frequency: 'daily',
        startDate: '2026-06-25',
        nextOccurrenceDate: '2026-06-25',
        status: 'active',
      });
      mockRecurringExpenseSplitRepo.find.mockResolvedValue([
        {
          id: 'split-1',
          participantUser: ownerUser,
          splitType: 'equal',
          shareValue: 1,
          amountOwed: 5,
        },
      ]);

      const result = await service.createRecurringExpense('user-owner', {
        title: 'Future Sub',
        amountTotal: 5,
        currency: 'USD',
        category: 'bills',
        paidByUserId: 'user-owner',
        frequency: 'daily',
        startDate: '2026-06-25',
        splits: [
          {
            participantUserId: 'user-owner',
            splitType: 'equal',
            shareValue: 1,
          },
        ],
      });

      expect(mockExpenseRepo.create).not.toHaveBeenCalled();
      expect(result.firstOccurrenceGenerated).toBe(false);
      expect(result.nextOccurrenceDate).toBe('2026-06-25');

      jest.useRealTimers();
    });

    it('should create group recurring expense template with a GroupMember (pending) payer', async () => {
      const ownerUser = { id: 'user-owner' };
      const group = { id: 'group-1', currency: 'USD' };
      const membership = {
        id: 'gm-owner',
        joinStatus: 'active',
        role: 'admin',
        user: ownerUser,
        group,
      };
      const paidByGroupMember = { id: 'gm-payer', group }; // pending — no .user
      const registeredParticipant = {
        id: 'gm-1',
        role: 'member',
        user: { id: 'user-1' },
      };
      const pendingNonParticipant = { id: 'gm-2', role: 'member' }; // no .user

      mockUserRepo.findOne.mockResolvedValueOnce(ownerUser); // ownerUser lookup

      mockGroupMemberRepo.findOne
        .mockResolvedValueOnce(membership) // getGroupMembership
        .mockResolvedValueOnce(paidByGroupMember); // paidByGroupMemberId resolution

      mockGroupRepo.findOne.mockResolvedValueOnce(group);

      mockGroupKeyVersionRepo.findOne.mockResolvedValueOnce({
        id: 'gkv-1',
        version: 1,
        status: 'ACTIVE',
      });

      // buildGroupParticipantMaps — includes a pending member with no `.user`
      // to prove the null-guard doesn't crash the map construction.
      mockGroupMemberRepo.find.mockResolvedValueOnce([
        registeredParticipant,
        pendingNonParticipant,
      ]);

      mockRecurringExpenseRepo.findOne.mockResolvedValue({
        id: 'template-id',
        title: 'Group Subscription',
        amountTotal: 100,
        currency: 'USD',
        paidByUser: undefined,
        paidByGroupMember,
        ownerUser,
        group,
        frequency: 'monthly',
        startDate: '2026-06-23',
        nextOccurrenceDate: '2026-06-23',
        status: 'active',
      });

      mockRecurringExpenseSplitRepo.find.mockResolvedValue([
        {
          id: 'split-1',
          participantGroupMember: registeredParticipant,
          splitType: 'equal',
          shareValue: 1,
          amountOwed: 100,
        },
      ]);

      const result = await service.createRecurringExpense('user-owner', {
        title: 'Group Subscription',
        amountTotal: 100,
        currency: 'USD',
        category: 'bills',
        paidByGroupMemberId: 'gm-payer',
        groupId: 'group-1',
        frequency: 'monthly',
        startDate: '2026-06-23',
        splits: [
          {
            participantGroupMemberId: 'gm-1',
            splitType: 'equal',
            shareValue: 1,
          },
        ],
      });

      expect(result.id).toBe('template-id');
      expect(result.paidByGroupMemberId).toBe('gm-payer');
      expect(result.paidByUserId).toBeNull();
      // Group templates report group scope so the client picks the group key
      // to decrypt the title/description ciphertext.
      expect(result.encryptionScope).toBe('group');
      expect(mockRecurringExpenseRepo.save).toHaveBeenCalled();
      const createCallArgs = mockRecurringExpenseRepo.create.mock.calls[0][0];
      expect(createCallArgs.paidByGroupMember).toBe(paidByGroupMember);
      expect(createCallArgs.paidByUser).toBeUndefined();
    });

    it('should reject creating a template with both paidByUserId and paidByGroupMemberId', async () => {
      await expect(
        service.createRecurringExpense('user-owner', {
          title: 'Bad',
          amountTotal: 100,
          currency: 'USD',
          category: 'bills',
          paidByUserId: 'user-owner',
          paidByGroupMemberId: 'gm-payer',
          groupId: 'group-1',
          frequency: 'monthly',
          startDate: '2026-06-23',
          splits: [
            {
              participantGroupMemberId: 'gm-1',
              splitType: 'equal',
              shareValue: 1,
            },
          ],
        } as any),
      ).rejects.toThrow(
        'Provide only one of paidByUserId or paidByGroupMemberId',
      );
    });

    it('should switch a group template payer from paidByUserId to paidByGroupMemberId on update', async () => {
      const ownerUser = { id: 'user-owner' };
      const group = { id: 'group-1', currency: 'USD' };
      const existingPaidByUser = { id: 'user-owner' };
      const template: any = {
        id: 'template-id',
        version: 1,
        amountTotal: 100,
        currency: 'USD',
        paidByUser: existingPaidByUser,
        paidByGroupMember: undefined,
        ownerUser,
        group,
        frequency: 'monthly',
        startDate: '2026-06-23',
        nextOccurrenceDate: '2026-06-23',
        status: 'active',
      };
      mockRecurringExpenseRepo.findOne
        .mockResolvedValueOnce(template) // initial fetch
        .mockResolvedValueOnce({
          ...template,
          paidByGroupMember: { id: 'gm-new' },
          paidByUser: undefined,
        }); // post-transaction fetch

      const membership = {
        id: 'gm-owner',
        joinStatus: 'active',
        role: 'admin',
        user: ownerUser,
        group,
      };
      const newPayerMember = { id: 'gm-new', group };

      mockGroupMemberRepo.findOne
        .mockResolvedValueOnce(membership) // ensureAccess -> getGroupMembership
        .mockResolvedValueOnce(newPayerMember); // paidByGroupMemberId resolution

      mockRecurringExpenseSplitRepo.find.mockResolvedValue([]);

      const result = await service.updateRecurringExpense(
        'user-owner',
        'template-id',
        {
          version: 1,
          paidByGroupMemberId: 'gm-new',
        } as any,
      );

      expect(result.paidByGroupMemberId).toBe('gm-new');
      expect(result.paidByUserId).toBeNull();
      expect(template.paidByGroupMember).toBe(newPayerMember);
      expect(template.paidByUser).toBeUndefined();
    });
  });

  describe('advanceDate (UTC, timezone-independent)', () => {
    // Date.UTC-based arithmetic → results do not depend on the runner's TZ.
    it('advances daily, including across month/year boundaries', () => {
      expect(scheduler.advanceDate('2026-06-20', 'daily')).toBe('2026-06-21');
      expect(scheduler.advanceDate('2026-06-30', 'daily')).toBe('2026-07-01');
      expect(scheduler.advanceDate('2026-12-31', 'daily')).toBe('2027-01-01');
    });

    it('advances weekly, including across a month boundary', () => {
      expect(scheduler.advanceDate('2026-06-20', 'weekly')).toBe('2026-06-27');
      expect(scheduler.advanceDate('2026-06-28', 'weekly')).toBe('2026-07-05');
    });

    it('advances monthly and yearly for non-month-end days', () => {
      expect(scheduler.advanceDate('2026-01-15', 'monthly')).toBe('2026-02-15');
      expect(scheduler.advanceDate('2026-12-10', 'monthly')).toBe('2027-01-10');
      expect(scheduler.advanceDate('2026-03-10', 'yearly')).toBe('2027-03-10');
    });
  });

  describe('RecurringExpensesScheduler Cron Engine', () => {
    it('generateDueOccurrences is idempotent per day — a re-run generates no duplicate', async () => {
      const template: any = {
        id: 'template-x',
        title: 'Daily',
        amountTotal: 5,
        currency: 'USD',
        category: 'food',
        paidByUser: { id: 'user-1' },
        ownerUser: { id: 'user-1' },
        frequency: 'daily' as const,
        nextOccurrenceDate: '2026-06-20',
        status: 'active' as const,
      };
      mockRecurringExpenseSplitRepo.find.mockResolvedValue([
        {
          participantUser: { id: 'user-1' },
          splitType: 'equal',
          shareValue: 1,
          amountOwed: 5,
        },
      ]);

      // First run (e.g. immediate create) materializes today and advances.
      await scheduler.generateDueOccurrences(template, '2026-06-20');
      expect(mockExpenseRepo.create).toHaveBeenCalledTimes(1);
      expect(template.nextOccurrenceDate).toBe('2026-06-21');

      // Second run for the same day (e.g. the midnight cron) is a no-op —
      // nextOccurrenceDate is already past today, so no duplicate expense.
      mockExpenseRepo.create.mockClear();
      await scheduler.generateDueOccurrences(template, '2026-06-20');
      expect(mockExpenseRepo.create).not.toHaveBeenCalled();
    });

    it('should process due active recurring expenses', async () => {
      // Freeze the clock so only one occurrence (2026-06-20) is due
      jest.useFakeTimers({ now: new Date('2026-06-20T12:00:00Z') });

      const template = {
        id: 'template-1',
        title: 'Weekly Rent',
        amountTotal: 500,
        currency: 'USD',
        category: 'rent',
        paidByUser: { id: 'user-1' },
        ownerUser: { id: 'user-1' },
        frequency: 'weekly' as const,
        startDate: '2026-06-20',
        nextOccurrenceDate: '2026-06-20',
        endDate: '2026-07-01',
        status: 'active' as const,
      };

      mockRecurringExpenseRepo.find.mockResolvedValueOnce([template]);

      const tSplits = [
        {
          participantUser: { id: 'user-1' },
          splitType: 'equal',
          shareValue: 1,
          amountOwed: 500,
        },
      ];
      mockRecurringExpenseSplitRepo.find.mockResolvedValueOnce(tSplits);

      // Run scheduler process function directly
      await scheduler.processDueExpenses();

      // Check if actual expense was created via entity manager transaction
      expect(mockExpenseRepo.create).toHaveBeenCalled();
      expect(mockExpenseRepo.save).toHaveBeenCalled();
      expect(mockExpenseSplitRepo.create).toHaveBeenCalled();
      expect(mockExpenseSplitRepo.save).toHaveBeenCalled();

      // Verify template dates are advanced (weekly rent from 2026-06-20 advances to 2026-06-27)
      expect(template.nextOccurrenceDate).toBe('2026-06-27');
      expect(template.status).toBe('active');

      jest.useRealTimers();
    });

    it('should copy paidByGroupMember (not paidByUser) onto the materialized Expense for a GroupMember-payer template', async () => {
      jest.useFakeTimers({ now: new Date('2026-06-20T12:00:00Z') });

      const group = { id: 'group-1', groupType: 'shared' };
      const paidByGroupMember = { id: 'gm-payer', group }; // pending — no .user
      const template = {
        id: 'template-2',
        title: 'Group Rent',
        amountTotal: 500,
        currency: 'USD',
        category: 'rent',
        paidByUser: undefined,
        paidByGroupMember,
        ownerUser: { id: 'user-1' },
        group,
        groupKeyVersion: { id: 'gkv-1', version: 1, status: 'ACTIVE' },
        frequency: 'weekly' as const,
        startDate: '2026-06-20',
        nextOccurrenceDate: '2026-06-20',
        endDate: '2026-07-01',
        status: 'active' as const,
      };

      mockRecurringExpenseRepo.find.mockResolvedValueOnce([template]);
      mockRecurringExpenseSplitRepo.find.mockResolvedValueOnce([
        {
          participantGroupMember: { id: 'gm-1' },
          splitType: 'equal',
          shareValue: 1,
          amountOwed: 500,
        },
      ]);

      await scheduler.processDueExpenses();

      const createCallArgs = mockExpenseRepo.create.mock.calls[0][0];
      expect(createCallArgs.paidByGroupMember).toBe(paidByGroupMember);
      expect(createCallArgs.paidByUser).toBeUndefined();

      jest.useRealTimers();
    });

    it('should acquire lock and run if lock is available', async () => {
      mockRedisService.setNx.mockResolvedValueOnce(true);
      const processDueExpensesSpy = jest
        .spyOn(scheduler, 'processDueExpenses')
        .mockResolvedValueOnce(undefined);

      await scheduler.handleRecurringExpensesCron();

      expect(mockRedisService.setNx).toHaveBeenCalledWith(
        'lock:recurring_expenses_cron',
        'locked',
        3600,
      );
      expect(processDueExpensesSpy).toHaveBeenCalled();
      processDueExpensesSpy.mockRestore();
    });

    it('should skip processing if lock is not acquired', async () => {
      mockRedisService.setNx.mockResolvedValueOnce(false);
      const processDueExpensesSpy = jest.spyOn(scheduler, 'processDueExpenses');

      await scheduler.handleRecurringExpensesCron();

      expect(mockRedisService.setNx).toHaveBeenCalledWith(
        'lock:recurring_expenses_cron',
        'locked',
        3600,
      );
      expect(processDueExpensesSpy).not.toHaveBeenCalled();
      processDueExpensesSpy.mockRestore();
    });
  });
});
