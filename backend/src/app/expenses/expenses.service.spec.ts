import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import {
  Attachment,
  AttachmentVersion,
  AuditLog,
  EncryptedExpenseKey,
  Expense,
  ExpenseSplit,
  ExpenseSplitVersion,
  ExpenseVersion,
  Group,
  GroupKeyVersion,
  GroupMember,
  ReceiptVersion,
  User,
} from '@finmate/data-models';
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
  let groupKeyVersionRepository: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
  };
  let expenseVersionRepository: jest.Mocked<Repository<ExpenseVersion>>;
  let expenseSplitVersionRepository: jest.Mocked<
    Repository<ExpenseSplitVersion>
  >;
  let attachmentVersionRepository: jest.Mocked<Repository<AttachmentVersion>>;
  let receiptVersionRepository: jest.Mocked<Repository<ReceiptVersion>>;

  beforeEach(async () => {
    const mockExpenseRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      save: jest.fn(async (data) => data),
      create: jest.fn((data) => data),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(),
      softRemove: jest.fn((data) => Promise.resolve(data)),
      restore: jest.fn(() => Promise.resolve()),
    };

    const mockSplitRepository = {
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn(async (data) => data),
      create: jest.fn((data) => data),
      delete: jest.fn(),
      softDelete: jest.fn(),
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
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn(async (data) => data),
      create: jest.fn((data) => data),
      delete: jest.fn(),
    };

    const mockAuditLogRepository = {
      save: jest.fn(async (data) => data),
      create: jest.fn((data) => data),
    };

    const mockEncryptedExpenseKeyRepository = {
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn(),
      create: jest.fn((data) => data),
      delete: jest.fn(),
    };

    const mockContributionRepository = {
      createQueryBuilder: jest.fn(() => ({
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      })),
    };

    const mockGroupKeyVersionRepository = {
      findOne: jest.fn(),
      save: jest.fn(async (data) => data),
      create: jest.fn((data) => data),
    };

    const mockExpenseVersionRepository = {
      save: jest.fn(async (data) => data),
      create: jest.fn((data) => data),
    };

    const mockExpenseSplitVersionRepository = {
      save: jest.fn(async (data) => data),
      create: jest.fn((data) => data),
    };

    const mockAttachmentVersionRepository = {
      save: jest.fn(async (data) => data),
      create: jest.fn((data) => data),
    };

    const mockReceiptVersionRepository = {
      save: jest.fn(async (data) => data),
      create: jest.fn((data) => data),
    };

    const mockEntityManager = {
      getRepository: jest.fn((entity) => {
        if (entity === Expense) return mockExpenseRepository;
        if (entity === ExpenseSplit) return mockSplitRepository;
        if (entity === Group) return mockGroupRepository;
        if (entity === GroupMember) return mockGroupMemberRepository;
        if (entity === User) return mockUserRepository;
        if (entity === Attachment) return mockAttachmentRepository;
        if (entity === AuditLog) return mockAuditLogRepository;
        if (entity === GroupKeyVersion) return mockGroupKeyVersionRepository;
        if (entity === ExpenseVersion) return mockExpenseVersionRepository;
        if (entity === ExpenseSplitVersion)
          return mockExpenseSplitVersionRepository;
        if (entity === AttachmentVersion)
          return mockAttachmentVersionRepository;
        if (entity === ReceiptVersion) return mockReceiptVersionRepository;
        if (entity === EncryptedExpenseKey)
          return mockEncryptedExpenseKeyRepository;
        if (
          entity &&
          (entity.name === 'GroupMemberContribution' ||
            (typeof entity === 'function' &&
              entity.name === 'GroupMemberContribution'))
        ) {
          return mockContributionRepository;
        }
      }),
    };

    const mockDataSource = {
      transaction: jest.fn(async (cb) => await cb(mockEntityManager)),
      getRepository: jest.fn((entity) =>
        mockEntityManager.getRepository(entity),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpensesService,
        {
          provide: getRepositoryToken(Expense),
          useValue: mockExpenseRepository,
        },
        {
          provide: getRepositoryToken(ExpenseSplit),
          useValue: mockSplitRepository,
        },
        { provide: getRepositoryToken(Group), useValue: mockGroupRepository },
        {
          provide: getRepositoryToken(GroupMember),
          useValue: mockGroupMemberRepository,
        },
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        {
          provide: getRepositoryToken(Attachment),
          useValue: mockAttachmentRepository,
        },
        {
          provide: getRepositoryToken(AuditLog),
          useValue: mockAuditLogRepository,
        },
        {
          provide: getRepositoryToken(EncryptedExpenseKey),
          useValue: mockEncryptedExpenseKeyRepository,
        },
        {
          provide: getRepositoryToken(ExpenseVersion),
          useValue: mockExpenseVersionRepository,
        },
        {
          provide: getRepositoryToken(ExpenseSplitVersion),
          useValue: mockExpenseSplitVersionRepository,
        },
        {
          provide: getRepositoryToken(AttachmentVersion),
          useValue: mockAttachmentVersionRepository,
        },
        {
          provide: getRepositoryToken(ReceiptVersion),
          useValue: mockReceiptVersionRepository,
        },
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<ExpensesService>(ExpensesService);
    expenseRepository = module.get(getRepositoryToken(Expense));
    splitRepository = module.get(getRepositoryToken(ExpenseSplit));
    groupRepository = module.get(getRepositoryToken(Group));
    groupMemberRepository = module.get(getRepositoryToken(GroupMember));
    userRepository = module.get(getRepositoryToken(User));
    attachmentRepository = module.get(getRepositoryToken(Attachment));
    groupKeyVersionRepository = mockGroupKeyVersionRepository;
    expenseVersionRepository = module.get(getRepositoryToken(ExpenseVersion));
    expenseSplitVersionRepository = module.get(
      getRepositoryToken(ExpenseSplitVersion),
    );
    attachmentVersionRepository = module.get(
      getRepositoryToken(AttachmentVersion),
    );
    receiptVersionRepository = module.get(getRepositoryToken(ReceiptVersion));
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
        splits: [
          { participantUserId: 'caller-id', splitType: 'equal', shareValue: 1 },
        ],
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
        splits: [
          { participantUserId: 'caller-id', splitType: 'equal', shareValue: 1 },
        ],
      } as any),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should reject personal create with participantGroupMemberId', async () => {
    userRepository.findOne
      .mockResolvedValueOnce({ id: 'caller-id' } as any)
      .mockResolvedValueOnce({ id: 'caller-id' } as any);

    await expect(
      service.createExpense('caller-id', {
        title: 'Lunch',
        amountTotal: 100,
        currency: 'USD',
        category: 'Food',
        paidByUserId: 'caller-id',
        expenseDate: '2026-06-10',
        splits: [
          {
            participantGroupMemberId: 'member-1',
            splitType: 'equal',
            shareValue: 1,
          },
        ],
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject create with direct_shared encryption scope', async () => {
    userRepository.findOne
      .mockResolvedValueOnce({ id: 'caller-id' } as any)
      .mockResolvedValueOnce({ id: 'caller-id' } as any);

    await expect(
      service.createExpense('caller-id', {
        title: 'Shared Lunch',
        amountTotal: 100,
        currency: 'USD',
        category: 'Food',
        paidByUserId: 'caller-id',
        expenseDate: '2026-06-10',
        encryptionScope: 'direct_shared',
        splits: [
          { participantUserId: 'caller-id', splitType: 'equal', shareValue: 1 },
        ],
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject personal create with multiple participants when no group is provided', async () => {
    userRepository.findOne
      .mockResolvedValueOnce({ id: 'caller-id' } as any)
      .mockResolvedValueOnce({ id: 'caller-id' } as any);

    await expect(
      service.createExpense('caller-id', {
        title: 'Shared Ride',
        amountTotal: 100,
        currency: 'USD',
        category: 'Travel',
        paidByUserId: 'caller-id',
        expenseDate: '2026-06-10',
        splits: [
          { participantUserId: 'caller-id', splitType: 'equal', shareValue: 1 },
          { participantUserId: 'friend-id', splitType: 'equal', shareValue: 1 },
        ],
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject create when group is archived', async () => {
    userRepository.findOne
      .mockResolvedValueOnce({ id: 'caller-id' } as any)
      .mockResolvedValueOnce({ id: 'caller-id' } as any);

    groupMemberRepository.findOne.mockResolvedValueOnce({
      id: 'membership-id',
      role: 'member',
      joinStatus: 'active',
    } as any);
    groupRepository.findOne.mockResolvedValueOnce({
      id: 'group-id',
      isArchived: true,
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
        splits: [
          { participantUserId: 'caller-id', splitType: 'equal', shareValue: 1 },
        ],
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

    await expect(
      service.getExpenseById('caller-id', 'missing'),
    ).rejects.toThrow(NotFoundException);
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

  it('should reject personal update when paidByUserId is not caller', async () => {
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
    userRepository.findOne.mockResolvedValue({ id: 'other-user' } as any);

    await expect(
      service.updateExpense('caller-id', 'exp-1', {
        version: 1,
        paidByUserId: 'other-user',
      } as any),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should reject group update when new payer is not group member', async () => {
    expenseRepository.findOne.mockResolvedValue({
      id: 'exp-1',
      version: 1,
      title: 'Trip',
      description: null,
      amountTotal: 50,
      currency: 'USD',
      category: 'Travel',
      paidByUser: { id: 'caller-id' },
      ownerUser: { id: 'caller-id' },
      expenseDate: '2026-06-10',
      status: 'posted',
      group: { id: 'group-id' },
    } as any);
    groupMemberRepository.findOne
      .mockResolvedValueOnce({
        id: 'membership-id',
        role: 'member',
        joinStatus: 'active',
      } as any)
      .mockResolvedValueOnce(null);
    groupRepository.findOne.mockResolvedValue({
      id: 'group-id',
      isArchived: false,
    } as any);
    userRepository.findOne.mockResolvedValue({ id: 'other-user' } as any);

    await expect(
      service.updateExpense('caller-id', 'exp-1', {
        version: 1,
        paidByUserId: 'other-user',
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
    expenseRepository.softRemove.mockResolvedValue(expense);

    await service.deleteExpense('caller-id', 'exp-1');

    expect(expense.status).toBe('void');
    expect(expenseRepository.softRemove).toHaveBeenCalledWith(expense);
  });

  it('should hard delete draft expense on delete', async () => {
    expenseRepository.findOne.mockResolvedValue({
      id: 'exp-1',
      status: 'draft',
      group: null,
      ownerUser: { id: 'caller-id' },
      paidByUser: { id: 'caller-id' },
    } as any);

    await service.deleteExpense('caller-id', 'exp-1');

    expect(expenseRepository.delete).toHaveBeenCalledWith({ id: 'exp-1' });
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

  it('should reject list request with invalid date format', async () => {
    await expect(
      service.listExpenses('caller-id', {
        page: 1,
        limit: 20,
        startDate: '06-10-2026',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject list request for unauthorized group filter', async () => {
    groupMemberRepository.find.mockResolvedValue([] as any);

    await expect(
      service.listExpenses('caller-id', {
        page: 1,
        limit: 20,
        groupId: 'group-id',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  // ─── Phase 5: Additional Unit Tests ────────────────────────────────────────

  describe('group key version stamping (G-ROT write path)', () => {
    const groupMember = {
      id: 'membership-id',
      role: 'member',
      joinStatus: 'active',
      user: { id: 'caller-id' },
    } as any;

    const baseGroupDto = {
      title: 'cipher:title',
      amountTotal: 100,
      currency: 'USD',
      category: 'Food',
      paidByUserId: 'caller-id',
      groupId: 'group-id',
      expenseDate: '2026-06-10',
      splits: [
        { participantUserId: 'caller-id', splitType: 'equal', shareValue: 1 },
      ],
    };

    it('should reject a declared groupKeyVersionId on a personal create', async () => {
      userRepository.findOne
        .mockResolvedValueOnce({ id: 'caller-id' } as any)
        .mockResolvedValueOnce({ id: 'caller-id' } as any);

      await expect(
        service.createExpense('caller-id', {
          ...baseGroupDto,
          groupId: undefined,
          groupKeyVersionId: 'v1-id',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject a declared version that does not belong to the group', async () => {
      userRepository.findOne.mockResolvedValue({ id: 'caller-id' } as any);
      groupMemberRepository.findOne.mockResolvedValue(groupMember);
      groupRepository.findOne.mockResolvedValue({
        id: 'group-id',
        currency: 'USD',
        isArchived: false,
      } as any);
      groupKeyVersionRepository.findOne.mockResolvedValue(null);

      await expect(
        service.createExpense('caller-id', {
          ...baseGroupDto,
          groupKeyVersionId: 'foreign-version-id',
        } as any),
      ).rejects.toThrow(BadRequestException);

      expect(groupKeyVersionRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'foreign-version-id', group: { id: 'group-id' } },
      });
    });

    it('should reject a declared version that is revoked', async () => {
      userRepository.findOne.mockResolvedValue({ id: 'caller-id' } as any);
      groupMemberRepository.findOne.mockResolvedValue(groupMember);
      groupRepository.findOne.mockResolvedValue({
        id: 'group-id',
        currency: 'USD',
        isArchived: false,
      } as any);
      groupKeyVersionRepository.findOne.mockResolvedValue({
        id: 'revoked-id',
        version: 1,
        status: 'REVOKED',
      } as any);

      await expect(
        service.createExpense('caller-id', {
          ...baseGroupDto,
          groupKeyVersionId: 'revoked-id',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should stamp the declared (even superseded) version on create instead of ACTIVE', async () => {
      userRepository.findOne.mockResolvedValue({ id: 'caller-id' } as any);
      groupMemberRepository.findOne.mockResolvedValue(groupMember);
      groupMemberRepository.find.mockResolvedValue([groupMember]);
      groupRepository.findOne.mockResolvedValue({
        id: 'group-id',
        currency: 'USD',
        isArchived: false,
      } as any);

      const supersededVersion = {
        id: 'v1-id',
        version: 1,
        status: 'SUPERSEDED',
      } as any;
      groupKeyVersionRepository.findOne.mockResolvedValue(supersededVersion);

      expenseRepository.save.mockImplementation(async (data: any) => ({
        ...data,
        id: 'exp-1',
      }));
      expenseRepository.findOne.mockResolvedValue({
        id: 'exp-1',
        title: 'cipher:title',
        amountTotal: 100,
        currency: 'USD',
        category: 'Food',
        expenseDate: '2026-06-10',
        status: 'posted',
        encryptionScope: 'group',
        isCarryForward: false,
        paidByUser: { id: 'caller-id' },
        ownerUser: { id: 'caller-id' },
        group: { id: 'group-id' },
        groupKeyVersion: supersededVersion,
      } as any);
      splitRepository.find.mockResolvedValue([]);
      attachmentRepository.find.mockResolvedValue([]);

      const result = await service.createExpense('caller-id', {
        ...baseGroupDto,
        groupKeyVersionId: 'v1-id',
        encryptedAttachments: [
          {
            storageKey: 'receipts/exp-1',
            encryptedFileKey: 'iv:key',
            encryptedOriginalName: 'iv:name',
            mimeType: 'image/jpeg',
            sizeBytes: 42,
          },
        ],
      } as any);

      expect(expenseRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          groupKeyVersion: expect.objectContaining({ id: 'v1-id' }),
        }),
      );
      expect(expenseVersionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'created',
          expense: expect.objectContaining({ id: 'exp-1' }),
          snapshot: expect.objectContaining({ groupKeyVersionId: 'v1-id' }),
        }),
      );
      expect(expenseSplitVersionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'created',
          expense: expect.objectContaining({ id: 'exp-1' }),
        }),
      );
      expect(attachmentVersionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'created',
          snapshot: expect.objectContaining({ storageKey: 'receipts/exp-1' }),
        }),
      );
      expect(receiptVersionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'created',
          snapshot: expect.objectContaining({ storageKey: 'receipts/exp-1' }),
        }),
      );
      expect(result['groupKeyVersionId']).toBe('v1-id');
    });

    it('should re-stamp the declared version on update', async () => {
      const expense = {
        id: 'exp-1',
        version: 1,
        title: 'cipher:old',
        description: null,
        amountTotal: 100,
        currency: 'USD',
        category: 'Food',
        expenseDate: '2026-06-10',
        status: 'posted',
        encryptionScope: 'group',
        isCarryForward: false,
        paidByUser: { id: 'caller-id' },
        ownerUser: { id: 'caller-id' },
        group: { id: 'group-id' },
        groupKeyVersion: { id: 'v1-id', version: 1 },
      } as any;

      expenseRepository.findOne.mockResolvedValue(expense);
      userRepository.findOne.mockResolvedValue({ id: 'caller-id' } as any);
      groupMemberRepository.findOne.mockResolvedValue(groupMember);
      groupRepository.findOne.mockResolvedValue({
        id: 'group-id',
        currency: 'USD',
        isArchived: false,
      } as any);
      splitRepository.find.mockResolvedValue([]);
      attachmentRepository.find.mockResolvedValue([]);

      const rotatedVersion = {
        id: 'v2-id',
        version: 2,
        status: 'ACTIVE',
      } as any;
      groupKeyVersionRepository.findOne.mockResolvedValue(rotatedVersion);

      const result = await service.updateExpense('caller-id', 'exp-1', {
        version: 1,
        title: 'cipher:new',
        groupKeyVersionId: 'v2-id',
      } as any);

      expect(groupKeyVersionRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'v2-id', group: { id: 'group-id' } },
      });
      expect(expense.groupKeyVersion).toEqual(
        expect.objectContaining({ id: 'v2-id' }),
      );
      expect(expenseVersionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'updated',
          expense: expect.objectContaining({ id: 'exp-1' }),
          snapshot: expect.objectContaining({ groupKeyVersionId: 'v2-id' }),
        }),
      );
      expect(result['groupKeyVersionId']).toBe('v2-id');
    });

    it('should reject a declared groupKeyVersionId on a personal update', async () => {
      expenseRepository.findOne.mockResolvedValue({
        id: 'exp-1',
        version: 1,
        title: 'Lunch',
        amountTotal: 50,
        currency: 'USD',
        category: 'Food',
        expenseDate: '2026-06-10',
        status: 'posted',
        paidByUser: { id: 'caller-id' },
        ownerUser: { id: 'caller-id' },
        group: null,
      } as any);
      userRepository.findOne.mockResolvedValue({ id: 'caller-id' } as any);
      splitRepository.find.mockResolvedValue([]);

      await expect(
        service.updateExpense('caller-id', 'exp-1', {
          version: 1,
          groupKeyVersionId: 'v1-id',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Phase 5 Verification Rules', () => {
    it('should reject createExpense when currency does not match group base currency', async () => {
      userRepository.findOne
        .mockResolvedValueOnce({ id: 'caller-id' } as any)
        .mockResolvedValueOnce({ id: 'caller-id' } as any);
      groupMemberRepository.findOne.mockResolvedValueOnce({
        id: 'membership-id',
        role: 'member',
        joinStatus: 'active',
      } as any);
      groupRepository.findOne.mockResolvedValueOnce({
        id: 'group-id',
        currency: 'EUR',
        isArchived: false,
      } as any);

      await expect(
        service.createExpense('caller-id', {
          title: 'Lunch',
          amountTotal: 100,
          currency: 'USD', // Mismatch
          category: 'Food',
          paidByUserId: 'caller-id',
          groupId: 'group-id',
          expenseDate: '2026-06-10',
          splits: [
            {
              participantUserId: 'caller-id',
              splitType: 'equal',
              shareValue: 1,
            },
          ],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject createExpense splits containing a spectator', async () => {
      userRepository.findOne
        .mockResolvedValueOnce({ id: 'caller-id' } as any)
        .mockResolvedValueOnce({ id: 'caller-id' } as any);
      groupMemberRepository.findOne.mockResolvedValueOnce({
        id: 'membership-id',
        role: 'member',
        joinStatus: 'active',
      } as any);
      groupRepository.findOne.mockResolvedValueOnce({
        id: 'group-id',
        currency: 'USD',
        isArchived: false,
      } as any);

      // In persistSplits, buildGroupParticipantMaps is called inside transaction
      // Mock the find method on GroupMember repository inside transaction
      // Set one of the splits to belong to a spectator
      const mockSpectatorMember = {
        id: 'spectator-member-id',
        role: 'spectator',
        joinStatus: 'active',
        user: { id: 'spectator-id' },
      };

      const mockGroupMemberRepositoryFind =
        groupMemberRepository.find as jest.Mock;
      mockGroupMemberRepositoryFind.mockResolvedValueOnce([
        mockSpectatorMember,
      ]);

      await expect(
        service.createExpense('caller-id', {
          title: 'Lunch',
          amountTotal: 100,
          currency: 'USD',
          category: 'Food',
          paidByUserId: 'caller-id',
          groupId: 'group-id',
          expenseDate: '2026-06-10',
          splits: [
            {
              participantUserId: 'spectator-id',
              splitType: 'equal',
              shareValue: 1,
            },
          ],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject updateExpense on a household group if ledger month is locked', async () => {
      expenseRepository.findOne.mockResolvedValue({
        id: 'exp-1',
        version: 1,
        title: 'Past Rent',
        amountTotal: 500,
        currency: 'USD',
        category: 'Housing',
        paidByUser: { id: 'caller-id' },
        ownerUser: { id: 'caller-id' },
        expenseDate: '2026-05-10',
        ledgerMonth: '2026-05', // Past month (June 2026 is current)
        status: 'posted',
        group: { id: 'group-id' },
      } as any);

      groupMemberRepository.findOne.mockResolvedValue({
        id: 'membership-id',
        role: 'member',
        joinStatus: 'active',
      } as any);

      groupRepository.findOne.mockResolvedValue({
        id: 'group-id',
        groupType: 'household',
        currency: 'USD',
        isArchived: false,
      } as any);

      await expect(
        service.updateExpense('caller-id', 'exp-1', {
          version: 1,
          title: 'Updated Rent',
        } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should calculate carry forward balances correctly for a household group', async () => {
      groupMemberRepository.findOne.mockResolvedValue({
        id: 'membership-id',
        role: 'member',
        joinStatus: 'active',
      } as any);
      groupRepository.findOne.mockResolvedValue({
        id: 'group-id',
        groupType: 'household',
        currency: 'USD',
      } as any);

      groupMemberRepository.find.mockResolvedValue([
        {
          id: 'member-a',
          user: { id: 'user-a', displayName: 'User A' },
          joinStatus: 'active',
        },
        {
          id: 'member-b',
          user: { id: 'user-b', displayName: 'User B' },
          joinStatus: 'active',
        },
      ] as any);

      // Expenses in the group for 2026-06
      expenseRepository.find.mockResolvedValue([
        {
          id: 'exp-1',
          amountTotal: 150,
          currency: 'USD',
          paidByUser: { id: 'user-a', displayName: 'User A' },
          ownerUser: { id: 'user-a' },
        },
      ] as any);

      const balances = await service.getCarryForwardSummary(
        'caller-id',
        'group-id',
        '2026-06',
      );

      // User A paid 150, owed 75 => net balance +75
      // User B paid 0, owed 75 => net balance -75
      const userABal = balances.find((b) => b.userId === 'user-a');
      const userBBal = balances.find((b) => b.userId === 'user-b');

      expect(userABal?.netBalance).toBe(75);
      expect(userBBal?.netBalance).toBe(-75);
    });

    it('should reject restoreExpense if restore window has expired', async () => {
      const pastDeletionDate = new Date();
      // Set to 2 months ago to be way outside grace period
      pastDeletionDate.setMonth(pastDeletionDate.getMonth() - 2);

      expenseRepository.findOne.mockResolvedValue({
        id: 'exp-1',
        title: 'Old Expense',
        deletedAt: pastDeletionDate,
        ownerUser: { id: 'caller-id' },
        paidByUser: { id: 'caller-id' },
        group: null,
      } as any);

      userRepository.findOne.mockResolvedValue({ id: 'caller-id' } as any);

      await expect(
        service.restoreExpense('caller-id', 'exp-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow restoreExpense if within restore window', async () => {
      const recentDeletionDate = new Date();
      // Set to current month, which is always inside restore window
      recentDeletionDate.setDate(1);

      const expense = {
        id: 'exp-1',
        title: 'Recent Expense',
        deletedAt: recentDeletionDate,
        ownerUser: { id: 'caller-id' },
        paidByUser: { id: 'caller-id' },
        group: null,
        status: 'void',
      } as any;

      expenseRepository.findOne.mockResolvedValue(expense);
      userRepository.findOne.mockResolvedValue({ id: 'caller-id' } as any);
      splitRepository.find.mockResolvedValue([]);
      attachmentRepository.find.mockResolvedValue([]);

      const result = await service.restoreExpense('caller-id', 'exp-1');

      expect(result.status).toBe('posted');
      expect(expenseRepository.restore).toHaveBeenCalledWith({ id: 'exp-1' });
    });

    describe('closeMonth', () => {
      it('should throw ForbiddenException if caller is not owner/admin', async () => {
        groupMemberRepository.findOne.mockResolvedValue({
          id: 'membership-id',
          role: 'member',
          joinStatus: 'active',
        } as any);

        await expect(
          service.closeMonth('caller-id', 'group-id', '2026-06'),
        ).rejects.toThrow(ForbiddenException);
      });

      it('should throw BadRequestException if group is not household', async () => {
        groupMemberRepository.findOne.mockResolvedValue({
          id: 'membership-id',
          role: 'admin',
          joinStatus: 'active',
        } as any);

        groupRepository.findOne.mockResolvedValue({
          id: 'group-id',
          groupType: 'normal',
          currency: 'USD',
        } as any);

        await expect(
          service.closeMonth('caller-id', 'group-id', '2026-06'),
        ).rejects.toThrow(BadRequestException);
      });

      it('should throw BadRequestException if month is in the future', async () => {
        groupMemberRepository.findOne.mockResolvedValue({
          id: 'membership-id',
          role: 'admin',
          joinStatus: 'active',
        } as any);

        groupRepository.findOne.mockResolvedValue({
          id: 'group-id',
          groupType: 'household',
          currency: 'USD',
        } as any);

        await expect(
          service.closeMonth('caller-id', 'group-id', '2099-12'),
        ).rejects.toThrow(BadRequestException);
      });

      it('should throw BadRequestException if month is already closed', async () => {
        groupMemberRepository.findOne.mockResolvedValue({
          id: 'membership-id',
          role: 'admin',
          joinStatus: 'active',
        } as any);

        groupRepository.findOne.mockResolvedValue({
          id: 'group-id',
          groupType: 'household',
          currency: 'USD',
        } as any);

        expenseRepository.count = jest.fn().mockResolvedValue(1);

        await expect(
          service.closeMonth('caller-id', 'group-id', '2026-06'),
        ).rejects.toThrow(BadRequestException);
      });

      it('should create system carry-forward expenses if carryForwardEnabled is true', async () => {
        groupMemberRepository.findOne.mockResolvedValue({
          id: 'membership-id',
          role: 'admin',
          user: { id: 'caller-id', displayName: 'Admin User' },
          joinStatus: 'active',
        } as any);

        groupRepository.findOne.mockResolvedValue({
          id: 'group-id',
          groupType: 'household',
          currency: 'USD',
          carryForwardEnabled: true,
        } as any);

        expenseRepository.count = jest.fn().mockResolvedValue(0);

        groupMemberRepository.find.mockResolvedValue([
          {
            id: 'member-a',
            user: {
              id: 'user-a',
              displayName: 'User A',
              email: 'a@finmate.com',
            },
            joinStatus: 'active',
          },
          {
            id: 'member-b',
            user: {
              id: 'user-b',
              displayName: 'User B',
              email: 'b@finmate.com',
            },
            joinStatus: 'active',
          },
        ] as any);

        expenseRepository.find.mockResolvedValue([
          {
            id: 'exp-1',
            amountTotal: 100,
            currency: 'USD',
            isCarryForward: false,
            paidByUser: { id: 'user-a', displayName: 'User A' },
            ownerUser: { id: 'user-a' },
          },
        ] as any);

        const result = await service.closeMonth(
          'caller-id',
          'group-id',
          '2026-06',
        );

        expect(result.nextLedgerMonth).toBe('2026-07');
        expect(result.carryForwardExpenseCount).toBe(1);
      });
    });
  });
});
