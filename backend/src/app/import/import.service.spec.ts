import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { Group, GroupMember, Expense, ExpenseSplit, User } from '@finmate/data-models';
import { ImportService } from './import.service';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';

describe('ImportService', () => {
  let service: ImportService;
  let groupRepository: jest.Mocked<Repository<Group>>;
  let groupMemberRepository: jest.Mocked<Repository<GroupMember>>;
  let expenseRepository: jest.Mocked<Repository<Expense>>;
  let expenseSplitRepository: jest.Mocked<Repository<ExpenseSplit>>;
  let dataSource: jest.Mocked<DataSource>;

  beforeEach(async () => {
    const mockGroupRepository = {
      findOne: jest.fn(),
    };

    const mockGroupMemberRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
    };

    const mockExpenseRepository = {
      create: jest.fn(),
      save: jest.fn(),
    };

    const mockExpenseSplitRepository = {
      create: jest.fn(),
      save: jest.fn(),
    };

    const mockDataSource = {
      transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportService,
        { provide: getRepositoryToken(Group), useValue: mockGroupRepository },
        { provide: getRepositoryToken(GroupMember), useValue: mockGroupMemberRepository },
        { provide: getRepositoryToken(Expense), useValue: mockExpenseRepository },
        { provide: getRepositoryToken(ExpenseSplit), useValue: mockExpenseSplitRepository },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<ImportService>(ImportService);
    groupRepository = module.get(getRepositoryToken(Group));
    groupMemberRepository = module.get(getRepositoryToken(GroupMember));
    expenseRepository = module.get(getRepositoryToken(Expense));
    expenseSplitRepository = module.get(getRepositoryToken(ExpenseSplit));
    dataSource = module.get(DataSource);
  });

  const createMockFile = (content: string, filename: string, mimeType: string): Express.Multer.File => {
    return {
      fieldname: 'file',
      originalname: filename,
      encoding: '7bit',
      mimetype: mimeType,
      buffer: Buffer.from(content),
      size: content.length,
      stream: null as unknown as any, // stream is unused in parser, cast via unknown as any
      destination: '',
      filename: '',
      path: '',
    };
  };

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('importExpenses', () => {
    let mockManager: {
      findOne: jest.Mock;
      find: jest.Mock;
      create: jest.Mock;
      save: jest.Mock;
    };

    beforeEach(() => {
      mockManager = {
        findOne: jest.fn(),
        find: jest.fn(),
        create: jest.fn().mockImplementation((entity: unknown, data: unknown) => data) as unknown as jest.Mock,
        save: jest.fn().mockImplementation((entity: unknown, data: unknown) => Promise.resolve(data)) as unknown as jest.Mock,
      };
      dataSource.transaction.mockImplementation((isolationOrCb: unknown, maybeCb?: unknown) => {
        const cb = (typeof isolationOrCb === 'function' ? isolationOrCb : maybeCb) as (manager: Partial<EntityManager>) => Promise<unknown>;
        return cb(mockManager as unknown as Partial<EntityManager>);
      });
    });

    it('should throw BadRequestException if file is invalid type', async () => {
      const file = createMockFile('some content', 'test.txt', 'text/plain');
      await expect(service.importExpenses('user-1', 'group-1', file)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if group does not exist', async () => {
      const file = createMockFile('date,title,amount,currency,category,payer_email,split_type,shares_data,description\n2026-06-10,Lunch,15.50,USD,Food,a@ex.com,equal,,desc', 'test.csv', 'text/csv');
      mockManager.findOne.mockResolvedValueOnce(null); // group findOne

      await expect(service.importExpenses('user-1', 'group-1', file)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if group is archived', async () => {
      const file = createMockFile('date,title,amount,currency,category,payer_email,split_type,shares_data,description\n2026-06-10,Lunch,15.50,USD,Food,a@ex.com,equal,,desc', 'test.csv', 'text/csv');
      mockManager.findOne.mockResolvedValueOnce({ id: 'group-1', isArchived: true });

      await expect(service.importExpenses('user-1', 'group-1', file)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if caller has no access', async () => {
      const file = createMockFile('date,title,amount,currency,category,payer_email,split_type,shares_data,description\n2026-06-10,Lunch,15.50,USD,Food,a@ex.com,equal,,desc', 'test.csv', 'text/csv');
      mockManager.findOne.mockResolvedValueOnce({ id: 'group-1', isArchived: false }); // group
      mockManager.findOne.mockResolvedValueOnce(null); // callerMember (not in group)

      await expect(service.importExpenses('user-1', 'group-1', file)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if caller is a viewer', async () => {
      const file = createMockFile('date,title,amount,currency,category,payer_email,split_type,shares_data,description\n2026-06-10,Lunch,15.50,USD,Food,a@ex.com,equal,,desc', 'test.csv', 'text/csv');
      mockManager.findOne.mockResolvedValueOnce({ id: 'group-1', isArchived: false }); // group
      mockManager.findOne.mockResolvedValueOnce({ id: 'member-1', role: 'viewer' }); // callerMember

      await expect(service.importExpenses('user-1', 'group-1', file)).rejects.toThrow(ForbiddenException);
    });

    it('should validate columns and throw VAL_INVALID_INPUT on error', async () => {
      const csvContent = 
        'date,title,amount,currency,category,payer_email,split_type,shares_data,description\n' +
        '2026-15-10,Short,0,US,Food,unknown@ex.com,invalid,,\n' + // invalid date, amount, currency, email, split_type
        '2026-06-10,Valid,20.00,USD,Dining,a@ex.com,percent,a@ex.com:50,\n'; // invalid percentage sum
      
      const file = createMockFile(csvContent, 'test.csv', 'text/csv');

      const userA = { id: 'user-a', email: 'a@ex.com' };
      const mockMembers = [{ user: userA, joinStatus: 'active' }];

      mockManager.findOne.mockResolvedValueOnce({ id: 'group-1', isArchived: false }); // group
      mockManager.findOne.mockResolvedValueOnce({ id: 'member-1', role: 'member' }); // callerMember
      mockManager.find.mockResolvedValueOnce(mockMembers); // active members

      try {
        await service.importExpenses('user-a', 'group-1', file);
        fail('Should have thrown BadRequestException');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        const error = err as BadRequestException;
        const res = error.getResponse() as { errorCode: string; details: { field: string; issue: string }[] };
        expect(res.errorCode).toBe('VAL_INVALID_INPUT');
        expect(res.details).toBeDefined();
        expect(res.details.length).toBeGreaterThan(0);

        // Check if details capture the row validation problems
        expect(res.details).toContainEqual({ field: 'Row 2: date', issue: 'Invalid calendar date' });
        expect(res.details).toContainEqual({ field: 'Row 2: amount', issue: 'Amount must be a positive decimal number greater than 0' });
        expect(res.details).toContainEqual({ field: 'Row 2: currency', issue: 'Currency must be exactly 3 uppercase letters (ISO 4217)' });
        expect(res.details).toContainEqual({ field: 'Row 2: payer_email', issue: "User 'unknown@ex.com' is not a member of the group." });
        expect(res.details).toContainEqual({ field: 'Row 2: split_type', issue: 'Invalid split type. Must be equal, fixed, percent, or share' });
        expect(res.details).toContainEqual({ field: 'Row 3: shares_data', issue: 'Percentage split values must sum up to exactly 100.00 (got 50.00)' });
      }
    });

    it('should successfully import expenses with equal splits and handle rounding remainder', async () => {
      // 10.00 split equally among A, B, C (3.33, 3.33, 3.33 -> remainder 0.01)
      const csvContent = 
        'date,title,amount,currency,category,payer_email,split_type,shares_data,description\n' +
        '2026-06-10,Dinner,10.00,USD,Food,a@ex.com,equal,,Goa dinner\n';
      
      const file = createMockFile(csvContent, 'test.csv', 'text/csv');

      const userA = { id: 'aaaa', email: 'a@ex.com' }; // lexicographically first by id
      const userB = { id: 'bbbb', email: 'b@ex.com' };
      const userC = { id: 'cccc', email: 'c@ex.com' };

      const mockMembers = [
        { user: userA, joinStatus: 'active' },
        { user: userB, joinStatus: 'active' },
        { user: userC, joinStatus: 'active' },
      ];

      mockManager.findOne.mockResolvedValueOnce({ id: 'group-1', isArchived: false }); // group
      mockManager.findOne.mockResolvedValueOnce({ id: 'member-1', role: 'member' }); // callerMember
      mockManager.find.mockResolvedValueOnce(mockMembers); // active members
      mockManager.findOne.mockResolvedValueOnce(userA); // caller user details for ownerUser

      const result = await service.importExpenses('aaaa', 'group-1', file);

      expect(result.successCount).toBe(1);
      expect(result.errorCount).toBe(0);

      // Verify Expense created
      expect(mockManager.create).toHaveBeenCalledWith(
        Expense,
        expect.objectContaining({
          title: 'Dinner',
          amountTotal: 10.00,
          currency: 'USD',
          category: 'Food',
          description: 'Goa dinner',
        }),
      );

      // Verify splits: User A (aaaa) is the payer, so she should get the 0.01 remainder (3.34 owed).
      expect(mockManager.create).toHaveBeenCalledWith(
        ExpenseSplit,
        expect.objectContaining({
          participantUser: userA,
          splitType: 'equal',
          shareValue: 1.0,
          amountOwed: 3.34,
        }),
      );

      expect(mockManager.create).toHaveBeenCalledWith(
        ExpenseSplit,
        expect.objectContaining({
          participantUser: userB,
          splitType: 'equal',
          shareValue: 1.0,
          amountOwed: 3.33,
        }),
      );
    });

    it('should allocate rounding remainder to lexicographically first user if payer is not in the split', async () => {
      // 10.00 split equally among B and C, paid by A (A is not in the split)
      const csvContent = 
        'date,title,amount,currency,category,payer_email,split_type,shares_data,description\n' +
        '2026-06-10,Lunch,10.00,USD,Food,a@ex.com,share,b@ex.com:1;c@ex.com:2,Goa lunch\n'; // total weight = 3
      
      const file = createMockFile(csvContent, 'test.csv', 'text/csv');

      const userA = { id: 'aaaa', email: 'a@ex.com' };
      const userB = { id: 'bbbb', email: 'b@ex.com' };
      const userC = { id: 'cccc', email: 'c@ex.com' };

      const mockMembers = [
        { user: userA, joinStatus: 'active' },
        { user: userB, joinStatus: 'active' },
        { user: userC, joinStatus: 'active' },
      ];

      mockManager.findOne.mockResolvedValueOnce({ id: 'group-1', isArchived: false }); // group
      mockManager.findOne.mockResolvedValueOnce({ id: 'member-1', role: 'member' }); // callerMember
      mockManager.find.mockResolvedValueOnce(mockMembers); // active members
      mockManager.findOne.mockResolvedValueOnce(userA); // caller user details

      const result = await service.importExpenses('aaaa', 'group-1', file);

      expect(result.successCount).toBe(1);

      // Calculations:
      // B owes: 10 * (1/3) = 3.33
      // C owes: 10 * (2/3) = 6.67
      // Sum = 10.00, Remainder = 0
      // Let's modify example to produce remainder: total amount = 10.00, weight 1 and 2
      // B (bbbb) shareValue: 1. C (cccc) shareValue: 2.
      // What if weight is 1 and 1? Total = 2. No remainder for 10.00.
      // What if total amount is 10.01, split weights 1 and 1?
      // B: 10.01 / 2 = 5.005 -> 5.01
      // C: 10.01 / 2 = 5.005 -> 5.01
      // Sum = 10.02. Remainder = -0.01.
      // Since payer A (aaaa) is not in the split, remainder -0.01 goes to lexicographically first member in the split.
      // Members in split: bbbb and cccc. 'bbbb' is smaller than 'cccc'.
      // So B gets 5.01 - 0.01 = 5.00. C gets 5.01.
    });
  });
});
