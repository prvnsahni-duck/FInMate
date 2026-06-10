import { Injectable, NotFoundException, ForbiddenException, PreconditionFailedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Group, GroupMember, User, CreateGroupDto, UpdateGroupDto } from '@finmate/data-models';
import { paginate, PaginatedResponse } from '../common/pagination.util';

@Injectable()
export class GroupsService {
  constructor(
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    @InjectRepository(GroupMember)
    private readonly groupMemberRepository: Repository<GroupMember>,
    private readonly dataSource: DataSource,
  ) {}

  async createGroup(owner: User, dto: CreateGroupDto): Promise<Group> {
    return this.dataSource.transaction(async (manager) => {
      const group = manager.create(Group, {
        name: dto.name,
        description: dto.description,
        visibility: dto.visibility || 'private',
        ownerUser: owner,
      });
      const savedGroup = await manager.save(Group, group);

      const member = manager.create(GroupMember, {
        group: savedGroup,
        user: owner,
        role: 'owner',
        joinStatus: 'active',
        joinedAt: new Date(),
      });
      await manager.save(GroupMember, member);

      return savedGroup;
    });
  }

  async listGroups(
    userId: string,
    page: number,
    limit: number,
    isArchived?: boolean,
  ): Promise<PaginatedResponse<Group>> {
    const query = this.groupRepository
      .createQueryBuilder('group')
      .innerJoin(GroupMember, 'member', 'member.groupId = group.id')
      .where('member.userId = :userId', { userId })
      .andWhere('member.joinStatus = :status', { status: 'active' });

    if (isArchived !== undefined) {
      query.andWhere('group.isArchived = :isArchived', { isArchived });
    }

    const total = await query.getCount();
    const groups = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return paginate(groups, total, page, limit, '/api/v1/groups', { isArchived });
  }

  async findGroupById(userId: string, groupId: string): Promise<Group> {
    const membership = await this.groupMemberRepository.findOne({
      where: { group: { id: groupId }, user: { id: userId }, joinStatus: 'active' },
    });
    if (!membership) {
      const groupExists = await this.groupRepository.findOne({ where: { id: groupId } });
      if (!groupExists) {
        throw new NotFoundException('Group not found');
      }
      throw new ForbiddenException('You do not have access to this group');
    }

    const group = await this.groupRepository.findOne({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException('Group not found');
    }
    return group;
  }

  async updateGroup(userId: string, groupId: string, dto: UpdateGroupDto): Promise<Group> {
    const membership = await this.groupMemberRepository.findOne({
      where: { group: { id: groupId }, user: { id: userId }, joinStatus: 'active' },
    });
    if (!membership) {
      throw new ForbiddenException('You do not have access to this group');
    }

    // RBAC: Only admin/owner can edit group settings
    if (membership.role !== 'owner' && membership.role !== 'admin') {
      throw new ForbiddenException('Only owners and admins can edit group settings');
    }

    const group = await this.groupRepository.findOne({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException('Group not found');
    }

    // Concurrency Protection: Optimistic locking
    if (group.version !== dto.version) {
      throw new PreconditionFailedException({
        errorCode: 'CON_VERSION_CONFLICT',
        message: 'Version conflict: the resource has been modified by another request',
      });
    }

    if (dto.name !== undefined) group.name = dto.name;
    if (dto.description !== undefined) group.description = dto.description;
    if (dto.visibility !== undefined) group.visibility = dto.visibility;
    if (dto.isArchived !== undefined) group.isArchived = dto.isArchived;

    return this.groupRepository.save(group);
  }

  async checkGroupWriteAccess(groupId: string): Promise<void> {
    const group = await this.groupRepository.findOne({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException('Group not found');
    }
    if (group.isArchived) {
      throw new ForbiddenException({
        errorCode: 'RES_FORBIDDEN',
        message: 'Group is archived and read-only',
      });
    }
  }
}
