import { BadRequestException, ForbiddenException, NotFoundException, PreconditionFailedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Attachment, Expense, ExpenseSplit, Group, GroupMember, User } from '@finmate/data-models';
import { Repository } from 'typeorm';
import { ExpensesService } from './expenses.service';

describe('ExpensesService', () => {
  let service: ExpensesService;
  let expenseRepository: jest.Mocked<Repository<Expense>>;
  let splitRepository: jest.Mocked<Repository<ExpenseSplit>>;
  let groupRepository: jest.Mocked<Repository<Group>>;
  let groupMemberRepository: jest.Mocked<Repository<GroupMember>>;
  let userRepository: jest.Mocked<Repository<User>>;
  let attachmentRepository: jest.Mocked<Repository<Attachment>>;

  beforeEach(async () => {
    const mockExpenseRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn((data) => data),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const mockSplitRepository = {
      find: jest.fn(),
      save: jest.fn(),
      create: jest.fn((data) => data),
      delete: jest.fn(),
    };

    const mockGroupRepository = {
      findOne: jest.fn(),
    };

    const mockGroupMemberRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
    };

    const mockUserRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
    };

    const mockAttachmentRepository = {
      find: jest.fn(),
      save: jest.fn(),
      create: jest.fn((data) => data),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpensesService,
        { provide: getRepositoryToken(Expense), useValue: mockExpenseRepository },
        { provide: getRepositoryToken(ExpenseSplit), useValue: mockSplitRepository },
        { provide: getRepositoryToken(Group), useValue: mockGroupRepository },
        { provide: getRepositoryToken(GroupMember), useValue: mockGroupMemberRepository },
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: getRepositoryToken(Attachment), useValue: mockAttachmentRepository },
      ],
    }).compile();

    service = module.get<ExpensesService>(ExpensesService);
    expenseRepository = module.get(getRepositoryToken(Expense));
    splitRepository = module.get(getRepositoryToken(ExpenseSplit));
    groupRepository = module.get(getRepositoryToken(Group));
    groupMemberRepository = module.get(getRepositoryToken(GroupMember));
    userRepository = module.get(getRepositoryToken(User));
    attachmentRepository = module.get(getRepositoryToken(Attachment));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should reject personal expense if paidByUserId is not caller', async () => {
    userRepository.findOne
      .mockResolvedValueOnce({ id: 'caller-id' } as any)
      .mockResolvedValueOnce({ id: 'other-id' } as any);

    await expect(
      service.createExpense('caller-id', {
        title: 'Lunch',
        amountTotal: 100,
        currency: 'usd',
        category: 'Food',
        paidByUserId: 'other-id',
        expenseDate: '2026-06-10',
        splits: [{ participantUserId: 'caller-id', splitType: 'equal', shareValue: 1 }],
      } as any),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should reject group write for viewer role', async () => {
    userRepository.findOne
      .mockResolvedValueOnce({ id: 'caller-id' } as any)
      .mockResolvedValueOnce({ id: 'caller-id' } as any);

    groupMemberRepository.findOne.mockResolvedValueOnce({
      id: 'membership-id',
      role: 'viewer',
      joinStatus: 'active',
    } as any);

    await expect(
      service.createExpense('caller-id', {
        title: 'Trip stay',
        amountTotal: 100,
        currency: 'INR',
        category: 'Accommodation',
        paidByUserId: 'caller-id',
        groupId: 'group-id',
        expenseDate: '2026-06-10',
        splits: [{ participantUserId: 'caller-id', splitType: 'equal', shareValue: 1 }],
      } as any),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should throw precondition failed on version conflict', async () => {
    expenseRepository.findOne.mockResolvedValue({
      id: 'exp-1',
      version: 2,
      group: null,
      ownerUser: { id: 'caller-id' },
      paidByUser: { id: 'caller-id' },
    } as any);

    await expect(
      service.updateExpense('caller-id', 'exp-1', {
        version: 1,
      } as any),
    ).rejects.toThrow(PreconditionFailedException);
  });

  it('should throw not found for unknown expense', async () => {
    expenseRepository.findOne.mockResolvedValue(null);

    await expect(service.getExpenseById('caller-id', 'missing')).rejects.toThrow(NotFoundException);
  });

  it('should require splits when amount changes on update', async () => {
    expenseRepository.findOne.mockResolvedValue({
      id: 'exp-1',
      version: 1,
      title: 'Lunch',
      description: null,
      amountTotal: 50,
      currency: 'USD',
      category: 'Food',
      paidByUser: { id: 'caller-id' },
      ownerUser: { id: 'caller-id' },
      expenseDate: '2026-06-10',
      status: 'posted',
      group: null,
    } as any);

    await expect(
      service.updateExpense('caller-id', 'exp-1', {
        version: 1,
        amountTotal: 55,
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('should void posted expense on delete', async () => {
    const expense = {
      id: 'exp-1',
      status: 'posted',
      group: null,
      ownerUser: { id: 'caller-id' },
      paidByUser: { id: 'caller-id' },
    } as any;

    expenseRepository.findOne.mockResolvedValue(expense);
    expenseRepository.save.mockResolvedValue(expense);

    await service.deleteExpense('caller-id', 'exp-1');

    expect(expense.status).toBe('void');
    expect(expenseRepository.save).toHaveBeenCalledWith(expense);
  });

  it('should build paginated list for caller', async () => {
    groupMemberRepository.find.mockResolvedValue([] as any);

    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(1),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        {
          id: 'exp-1',
          title: 'Lunch',
          description: null,
          amountTotal: 50,
          currency: 'USD',
          category: 'Food',
          paidByUser: { id: 'caller-id' },
          ownerUser: { id: 'caller-id' },
          group: null,
          expenseDate: '2026-06-10',
          status: 'posted',
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
    };

    expenseRepository.createQueryBuilder.mockReturnValue(queryBuilder as any);
    splitRepository.find.mockResolvedValue([] as any);
    attachmentRepository.find.mockResolvedValue([] as any);

    const result = await service.listExpenses('caller-id', {
      page: 1,
      limit: 20,
      category: 'Food',
    });

    expect(result.meta.totalItems).toBe(1);
    expect(result.data).toHaveLength(1);
  });
});
