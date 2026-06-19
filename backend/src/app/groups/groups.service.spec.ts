import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GroupsService } from './groups.service';
import { Group, GroupMember, User, AuditLog } from '@finmate/data-models';
import { Repository, DataSource } from 'typeorm';
import { NotFoundException, ForbiddenException, PreconditionFailedException, ConflictException, BadRequestException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../email/email.service';

jest.mock('argon2');

describe('GroupsService', () => {
  let service: GroupsService;
  let groupRepository: jest.Mocked<Repository<Group>>;
  let groupMemberRepository: jest.Mocked<Repository<GroupMember>>;
  let userRepository: any;
  let dataSource: jest.Mocked<DataSource>;

  beforeEach(async () => {
    const mockGroupRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn((entity, data) => data),
      createQueryBuilder: jest.fn(() => ({
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      })),
    };

    const mockGroupMemberRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      create: jest.fn((entity, data) => data),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockImplementation(() => mockGroupMemberRepository.findOne()),
      })),
    };

    const mockAuditLogRepository = {
      save: jest.fn(),
      create: jest.fn((data) => data),
      createQueryBuilder: jest.fn(() => ({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      })),
    };

    const mockManager = {
      create: jest.fn((entity, data) => data),
      save: jest.fn(async (entity, data) => data),
    };

    const mockUserRepository = {
      findOne: jest.fn(),
      save: jest.fn(async (data) => data),
      create: jest.fn((data) => data),
    };
    userRepository = mockUserRepository;

    const mockDataSource = {
      transaction: jest.fn((cb) => cb(mockManager)),
      getRepository: jest.fn((entity) => {
        if (entity === User) return mockUserRepository;
        if (entity === Group) return mockGroupRepository;
        if (entity === GroupMember) return mockGroupMemberRepository;
        if (entity === AuditLog) return mockAuditLogRepository;
        return null;
      }),
    };

    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'FRONTEND_URL') return 'http://localhost:4200';
        return null;
      }),
    };

    const mockEmailService = {
      sendInviteEmail: jest.fn().mockResolvedValue(undefined),
      logger: {
        error: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupsService,
        { provide: getRepositoryToken(Group), useValue: mockGroupRepository },
        { provide: getRepositoryToken(GroupMember), useValue: mockGroupMemberRepository },
        { provide: getRepositoryToken(AuditLog), useValue: mockAuditLogRepository },
        { provide: DataSource, useValue: mockDataSource },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    service = module.get<GroupsService>(GroupsService);
    groupRepository = module.get(getRepositoryToken(Group));
    groupMemberRepository = module.get(getRepositoryToken(GroupMember));
    dataSource = module.get(DataSource);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createGroup', () => {
    it('should create group and owner member in transaction', async () => {
      const owner = { id: 'owner-id', email: 'owner@example.com' } as User;
      const dto = { name: 'Goa Trip', description: 'Fun trip' };

      const result = await service.createGroup(owner, dto);

      expect(dataSource.transaction).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.name).toBe('Goa Trip');
    });
  });

  describe('listGroups', () => {
    it('should query and return paginated list of groups', async () => {
      const result = await service.listGroups('user-id', 1, 20);

      expect(result).toBeDefined();
      expect(result.data).toEqual([]);
      expect(result.meta.currentPage).toBe(1);
    });
  });

  describe('findGroupById', () => {
    it('should throw ForbiddenException if user is not a member', async () => {
      groupMemberRepository.findOne.mockResolvedValue(null);
      groupRepository.findOne.mockResolvedValue({ id: 'group-id' } as any);

      await expect(service.findGroupById('user-id', 'group-id')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should return group if user is an active member', async () => {
      groupMemberRepository.findOne.mockResolvedValue({ id: 'member-id' } as any);
      groupRepository.findOne.mockResolvedValue({ id: 'group-id', name: 'Goa Trip' } as any);

      const result = await service.findGroupById('user-id', 'group-id');

      expect(result).toBeDefined();
      expect(result.name).toBe('Goa Trip');
    });
  });

  describe('updateGroup', () => {
    it('should throw ForbiddenException if user is not owner/admin', async () => {
      groupMemberRepository.findOne.mockResolvedValue({ id: 'member-id', role: 'member' } as any);

      await expect(
        service.updateGroup('user-id', 'group-id', { version: 1, name: 'New Name' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw PreconditionFailedException on version conflict', async () => {
      groupMemberRepository.findOne.mockResolvedValue({ id: 'member-id', role: 'owner' } as any);
      groupRepository.findOne.mockResolvedValue({ id: 'group-id', version: 2 } as any);

      await expect(
        service.updateGroup('user-id', 'group-id', { version: 1, name: 'New Name' }),
      ).rejects.toThrow(PreconditionFailedException);
    });

    it('should successfully update group if role is owner/admin and version matches', async () => {
      const mockGroup = { id: 'group-id', version: 1, name: 'Old Name' } as any;
      groupMemberRepository.findOne.mockResolvedValue({ id: 'member-id', role: 'owner' } as any);
      groupRepository.findOne.mockResolvedValue(mockGroup);
      groupRepository.save.mockResolvedValue(mockGroup);

      const result = await service.updateGroup('user-id', 'group-id', {
        version: 1,
        name: 'New Name',
      });

      expect(mockGroup.name).toBe('New Name');
      expect(result).toBeDefined();
    });
  });

  describe('checkGroupWriteAccess', () => {
    it('should throw ForbiddenException if group is archived', async () => {
      groupRepository.findOne.mockResolvedValue({ id: 'group-id', isArchived: true } as any);

      await expect(service.checkGroupWriteAccess('group-id')).rejects.toThrow(ForbiddenException);
    });

    it('should pass if group is not archived', async () => {
      groupRepository.findOne.mockResolvedValue({ id: 'group-id', isArchived: false } as any);

      await expect(service.checkGroupWriteAccess('group-id')).resolves.not.toThrow();
    });
  });

  describe('inviteMember', () => {
    it('should throw ForbiddenException if caller is not owner/admin', async () => {
      groupMemberRepository.findOne.mockResolvedValue({ id: 'member-id', role: 'member' } as any);

      await expect(
        service.inviteMember('user-id', 'group-id', { email: 'test@example.com' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should create placeholder user if target email does not exist', async () => {
      groupMemberRepository.findOne.mockResolvedValueOnce({
        id: 'caller-id',
        role: 'owner',
        user: { id: 'owner-id', email: 'owner@example.com', displayName: 'Owner' },
      } as any);
      groupRepository.findOne.mockResolvedValueOnce({ id: 'group-id' } as any);
      userRepository.findOne.mockResolvedValueOnce(null);
      (argon2.hash as jest.Mock).mockResolvedValue('hashed-dummy-pass');
      userRepository.save.mockResolvedValueOnce({ id: 'new-user-id', email: 'new@example.com', status: 'invited' });
      groupMemberRepository.findOne.mockResolvedValueOnce(null);
      groupMemberRepository.save.mockResolvedValueOnce({ id: 'new-member-id' } as any);

      const result = await service.inviteMember('owner-id', 'group-id', { email: 'new@example.com', role: 'member' });

      expect(userRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@example.com', status: 'invited' }),
      );
      expect(result).toBeDefined();
    });

    it('should throw ConflictException if user is already a member', async () => {
      groupMemberRepository.findOne.mockResolvedValueOnce({
        id: 'caller-id',
        role: 'owner',
        user: { id: 'owner-id', email: 'owner@example.com', displayName: 'Owner' },
      } as any);
      groupRepository.findOne.mockResolvedValueOnce({ id: 'group-id' } as any);
      userRepository.findOne.mockResolvedValueOnce({ id: 'target-user-id' } as any);
      groupMemberRepository.findOne.mockResolvedValueOnce({
        id: 'existing-member-id',
        joinStatus: 'active',
        user: { id: 'target-user-id' },
      } as any);

      await expect(
        service.inviteMember('owner-id', 'group-id', { email: 'target@example.com' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should re-invite user if they had left/been removed', async () => {
      groupMemberRepository.findOne.mockResolvedValueOnce({
        id: 'caller-id',
        role: 'owner',
        user: { id: 'owner-id', email: 'owner@example.com', displayName: 'Owner' },
      } as any);
      groupRepository.findOne.mockResolvedValueOnce({ id: 'group-id' } as any);
      userRepository.findOne.mockResolvedValueOnce({ id: 'target-user-id', email: 'target@example.com' } as any);
      
      const existingMember = {
        id: 'existing-member-id',
        joinStatus: 'left',
        user: { id: 'target-user-id', email: 'target@example.com' },
      } as any;
      groupMemberRepository.findOne.mockResolvedValueOnce(existingMember);
      groupMemberRepository.save.mockResolvedValueOnce(existingMember);

      const result = await service.inviteMember('owner-id', 'group-id', { email: 'target@example.com', role: 'viewer' });

      expect(existingMember.joinStatus).toBe('invited');
      expect(existingMember.role).toBe('viewer');
      expect(result).toBeDefined();
    });
  });

  describe('listMembers', () => {
    it('should throw ForbiddenException if caller is not in group', async () => {
      groupMemberRepository.findOne.mockResolvedValue(null);

      await expect(service.listMembers('user-id', 'group-id')).rejects.toThrow(ForbiddenException);
    });

    it('should list all members if caller is in group', async () => {
      groupMemberRepository.findOne.mockResolvedValue({ id: 'caller-id' } as any);
      groupMemberRepository.find.mockResolvedValue([{ id: 'member-1' }, { id: 'member-2' }] as any);

      const result = await service.listMembers('user-id', 'group-id');
      expect(result.length).toBe(2);
    });
  });

  describe('updateMember', () => {
    it('should throw ForbiddenException if caller does not have access', async () => {
      groupMemberRepository.findOne.mockResolvedValueOnce(null);

      await expect(
        service.updateMember('user-id', 'group-id', 'member-id', { joinStatus: 'active' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if caller tries to update their own role', async () => {
      groupMemberRepository.findOne.mockResolvedValueOnce({ id: 'caller-id', role: 'member', user: { id: 'user-id' } } as any);
      groupMemberRepository.findOne.mockResolvedValueOnce({ id: 'caller-id', role: 'member', user: { id: 'user-id' } } as any);

      await expect(
        service.updateMember('user-id', 'group-id', 'caller-id', { role: 'admin' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow self-update to accept invitation', async () => {
      const selfMember = { id: 'caller-id', joinStatus: 'invited', role: 'member', user: { id: 'user-id' } } as any;
      groupMemberRepository.findOne.mockResolvedValueOnce(selfMember);
      groupMemberRepository.findOne.mockResolvedValueOnce(selfMember);
      groupMemberRepository.save.mockResolvedValueOnce(selfMember);

      const result = await service.updateMember('user-id', 'group-id', 'caller-id', { joinStatus: 'active' });

      expect(selfMember.joinStatus).toBe('active');
      expect(selfMember.joinedAt).toBeDefined();
      expect(result).toBeDefined();
    });

    it('should throw BadRequestException if owner tries to leave without transferring ownership', async () => {
      const selfMember = { id: 'caller-id', joinStatus: 'active', role: 'owner', user: { id: 'user-id' } } as any;
      groupMemberRepository.findOne.mockResolvedValueOnce(selfMember);
      groupMemberRepository.findOne.mockResolvedValueOnce(selfMember);

      await expect(
        service.updateMember('user-id', 'group-id', 'caller-id', { joinStatus: 'left' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow self-update to leave group', async () => {
      const selfMember = { id: 'caller-id', joinStatus: 'active', role: 'member', user: { id: 'user-id' } } as any;
      groupMemberRepository.findOne.mockResolvedValueOnce(selfMember);
      groupMemberRepository.findOne.mockResolvedValueOnce(selfMember);
      groupMemberRepository.save.mockResolvedValueOnce(selfMember);

      const result = await service.updateMember('user-id', 'group-id', 'caller-id', { joinStatus: 'left' });

      expect(selfMember.joinStatus).toBe('left');
      expect(selfMember.leftAt).toBeDefined();
      expect(result).toBeDefined();
    });

    it('should throw ForbiddenException if caller is not admin/owner when modifying someone else', async () => {
      const caller = { id: 'caller-id', joinStatus: 'active', role: 'member', user: { id: 'caller-user-id' } } as any;
      const target = { id: 'target-id', joinStatus: 'active', role: 'member', user: { id: 'target-user-id' } } as any;
      
      groupMemberRepository.findOne.mockResolvedValueOnce(caller);
      groupMemberRepository.findOne.mockResolvedValueOnce(target);

      await expect(
        service.updateMember('caller-user-id', 'group-id', 'target-id', { role: 'admin' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if admin caller tries to modify owner/admin target', async () => {
      const caller = { id: 'caller-id', joinStatus: 'active', role: 'admin', user: { id: 'caller-user-id' } } as any;
      const target = { id: 'target-id', joinStatus: 'active', role: 'owner', user: { id: 'target-user-id' } } as any;

      groupMemberRepository.findOne.mockResolvedValueOnce(caller);
      groupMemberRepository.findOne.mockResolvedValueOnce(target);

      await expect(
        service.updateMember('caller-user-id', 'group-id', 'target-id', { joinStatus: 'removed' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow owner to transfer ownership in transaction', async () => {
      const caller = { id: 'caller-id', joinStatus: 'active', role: 'owner', user: { id: 'caller-user-id' } } as any;
      const target = { id: 'target-id', joinStatus: 'active', role: 'admin', user: { id: 'target-user-id' } } as any;

      groupMemberRepository.findOne.mockResolvedValueOnce(caller);
      groupMemberRepository.findOne.mockResolvedValueOnce(target);

      const result = await service.updateMember('caller-user-id', 'group-id', 'target-id', { role: 'owner' });

      expect(dataSource.transaction).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('removeMember', () => {
    it('should allow self-remove (leaving) if not owner', async () => {
      const selfMember = { id: 'caller-id', joinStatus: 'active', role: 'member', user: { id: 'user-id' } } as any;
      groupMemberRepository.findOne.mockResolvedValueOnce(selfMember);
      groupMemberRepository.findOne.mockResolvedValueOnce(selfMember);

      await service.removeMember('user-id', 'group-id', 'caller-id');

      expect(selfMember.joinStatus).toBe('left');
      expect(selfMember.leftAt).toBeDefined();
    });

    it('should allow admin caller to remove member target', async () => {
      const caller = { id: 'caller-id', joinStatus: 'active', role: 'admin', user: { id: 'caller-user-id' } } as any;
      const target = { id: 'target-id', joinStatus: 'active', role: 'member', user: { id: 'target-user-id' } } as any;

      groupMemberRepository.findOne.mockResolvedValueOnce(caller);
      groupMemberRepository.findOne.mockResolvedValueOnce(target);

      await service.removeMember('caller-user-id', 'group-id', 'target-id');

      expect(target.joinStatus).toBe('removed');
      expect(target.leftAt).toBeDefined();
    });
  });
});
