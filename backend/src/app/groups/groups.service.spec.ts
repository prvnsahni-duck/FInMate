import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GroupsService } from './groups.service';
import { Group, GroupMember, User } from '@finmate/data-models';
import { Repository, DataSource } from 'typeorm';
import { NotFoundException, ForbiddenException, PreconditionFailedException } from '@nestjs/common';

describe('GroupsService', () => {
  let service: GroupsService;
  let groupRepository: jest.Mocked<Repository<Group>>;
  let groupMemberRepository: jest.Mocked<Repository<GroupMember>>;
  let dataSource: jest.Mocked<DataSource>;

  beforeEach(async () => {
    const mockRepository = {
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

    const mockManager = {
      create: jest.fn((entity, data) => data),
      save: jest.fn(async (entity, data) => data),
    };

    const mockDataSource = {
      transaction: jest.fn((cb) => cb(mockManager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupsService,
        { provide: getRepositoryToken(Group), useValue: mockRepository },
        { provide: getRepositoryToken(GroupMember), useValue: mockRepository },
        { provide: DataSource, useValue: mockDataSource },
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
});
