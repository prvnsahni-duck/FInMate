import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  RecurringExpense,
  RecurringExpenseSplit,
  Expense,
  ExpenseSplit,
  Group,
  GroupMember,
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

  const mockTransactionManager = {
    getRepository: jest.fn((entity) => {
      if (entity === RecurringExpense) return mockRecurringExpenseRepo;
      if (entity === RecurringExpenseSplit)
        return mockRecurringExpenseSplitRepo;
      if (entity === Expense) return mockExpenseRepo;
      if (entity === ExpenseSplit) return mockExpenseSplitRepo;
      if (entity === User) return mockUserRepo;
      if (entity === GroupMember) return mockGroupMemberRepo;
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
  });

  describe('RecurringExpensesScheduler Cron Engine', () => {
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
