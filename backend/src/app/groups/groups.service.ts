import { Injectable, NotFoundException, ForbiddenException, PreconditionFailedException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Group, GroupMember, User, CreateGroupDto, UpdateGroupDto, InviteMemberDto, UpdateMemberDto } from '@finmate/data-models';
import { paginate, PaginatedResponse } from '../common/pagination.util';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';

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
        currency: dto.currency || 'USD',
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
      .innerJoin(GroupMember, 'member', 'member.group_id = group.id')
      .where('member.user_id = :userId', { userId })
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
    const membership = await this.groupMemberRepository
      .createQueryBuilder('member')
      .where('member.group_id = :groupId', { groupId })
      .andWhere('member.user_id = :userId', { userId })
      .andWhere('member.joinStatus = :status', { status: 'active' })
      .getOne();
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
    const membership = await this.groupMemberRepository
      .createQueryBuilder('member')
      .where('member.group_id = :groupId', { groupId })
      .andWhere('member.user_id = :userId', { userId })
      .andWhere('member.joinStatus = :status', { status: 'active' })
      .getOne();
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
    if (dto.currency !== undefined) group.currency = dto.currency.toUpperCase();

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

  async inviteMember(userId: string, groupId: string, dto: InviteMemberDto): Promise<GroupMember> {
    const callerMember = await this.groupMemberRepository
      .createQueryBuilder('member')
      .where('member.group_id = :groupId', { groupId })
      .andWhere('member.user_id = :userId', { userId })
      .andWhere('member.joinStatus = :status', { status: 'active' })
      .getOne();
    if (!callerMember || (callerMember.role !== 'owner' && callerMember.role !== 'admin')) {
      throw new ForbiddenException('Only owners and admins can invite members');
    }

    const group = await this.groupRepository.findOne({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException('Group not found');
    }

    // Resolve email (create placeholder user if not found)
    let targetUser = await this.dataSource.getRepository(User).findOne({ where: { email: dto.email } });
    if (!targetUser) {
      const dummyPassword = await argon2.hash(randomUUID());
      targetUser = this.dataSource.getRepository(User).create({
        email: dto.email,
        passwordHash: dummyPassword,
        status: 'invited',
      });
      targetUser = await this.dataSource.getRepository(User).save(targetUser);
    }

    // Check existing membership
    const existingMember = await this.groupMemberRepository
      .createQueryBuilder('member')
      .leftJoinAndSelect('member.user', 'user')
      .where('member.group_id = :groupId', { groupId })
      .andWhere('member.user_id = :targetUserId', { targetUserId: targetUser.id })
      .getOne();

    if (existingMember) {
      if (existingMember.joinStatus === 'active' || existingMember.joinStatus === 'invited') {
        throw new ConflictException({
          errorCode: 'RES_ALREADY_EXISTS',
          message: 'User is already a member or has a pending invitation',
        });
      }
      // Re-invite
      existingMember.joinStatus = 'invited';
      existingMember.role = dto.role || 'member';
      existingMember.joinedAt = undefined;
      existingMember.leftAt = undefined;
      return this.groupMemberRepository.save(existingMember);
    }

    const newMember = this.groupMemberRepository.create({
      group,
      user: targetUser,
      role: dto.role || 'member',
      joinStatus: 'invited',
    });

    return this.groupMemberRepository.save(newMember);
  }

  async listMembers(userId: string, groupId: string): Promise<GroupMember[]> {
    const callerMember = await this.groupMemberRepository
      .createQueryBuilder('member')
      .where('member.group_id = :groupId', { groupId })
      .andWhere('member.user_id = :userId', { userId })
      .andWhere('member.joinStatus = :status', { status: 'active' })
      .getOne();
    if (!callerMember) {
      throw new ForbiddenException('You do not have access to this group');
    }

    return this.groupMemberRepository.find({
      where: {
        group: { id: groupId },
      },
      relations: ['user'],
    });
  }

  async updateMember(
    userId: string,
    groupId: string,
    memberId: string,
    dto: UpdateMemberDto,
  ): Promise<GroupMember> {
    const callerMember = await this.groupMemberRepository
      .createQueryBuilder('member')
      .where('member.group_id = :groupId', { groupId })
      .andWhere('member.user_id = :userId', { userId })
      .getOne();
    if (!callerMember) {
      throw new ForbiddenException('You do not have access to this group');
    }
    if (callerMember.joinStatus !== 'active' && callerMember.joinStatus !== 'invited') {
      throw new ForbiddenException('You do not have access to this group');
    }

    const targetMember = await this.groupMemberRepository
      .createQueryBuilder('member')
      .leftJoinAndSelect('member.user', 'user')
      .where('member.id = :memberId', { memberId })
      .andWhere('member.group_id = :groupId', { groupId })
      .getOne();
    if (!targetMember) {
      throw new NotFoundException('Member record not found');
    }

    const isSelf = targetMember.user.id === userId;

    if (isSelf) {
      // Self-update is limited to joinStatus changes (accepting invite or leaving)
      if (dto.role && dto.role !== targetMember.role) {
        throw new ForbiddenException('You cannot modify your own role');
      }

      if (dto.joinStatus) {
        if (dto.joinStatus === 'active') {
          if (targetMember.joinStatus !== 'invited') {
            throw new BadRequestException('Can only accept active invitations');
          }
          targetMember.joinStatus = 'active';
          targetMember.joinedAt = new Date();
        } else if (dto.joinStatus === 'left') {
          if (targetMember.role === 'owner') {
            throw new BadRequestException('Owner must transfer group ownership before leaving');
          }
          targetMember.joinStatus = 'left';
          targetMember.leftAt = new Date();
        } else {
          throw new BadRequestException('Invalid join status transition for self');
        }
      }
    } else {
      // Modifying someone else (requires owner/admin)
      if (callerMember.joinStatus !== 'active') {
        throw new ForbiddenException('You must accept the invitation first');
      }
      if (callerMember.role !== 'owner' && callerMember.role !== 'admin') {
        throw new ForbiddenException('Only owners and admins can modify other members');
      }

      // Admin bounds: cannot demote or modify owner/admin
      if (callerMember.role === 'admin' && (targetMember.role === 'owner' || targetMember.role === 'admin')) {
        throw new ForbiddenException('Admins cannot modify other admins or the owner');
      }

      if (dto.role) {
        if (dto.role === 'owner') {
          // Ownership transfer (requires current owner)
          if (callerMember.role !== 'owner') {
            throw new ForbiddenException('Only the current owner can transfer ownership');
          }

          return this.dataSource.transaction(async (manager) => {
            callerMember.role = 'admin';
            await manager.save(GroupMember, callerMember);
            
            targetMember.role = 'owner';
            targetMember.joinStatus = 'active'; // ensure active
            return manager.save(GroupMember, targetMember);
          });
        }
        targetMember.role = dto.role;
      }

      if (dto.joinStatus) {
        if (dto.joinStatus === 'removed') {
          targetMember.joinStatus = 'removed';
          targetMember.leftAt = new Date();
        } else {
          throw new BadRequestException('Admins can only transition status to removed');
        }
      }
    }

    return this.groupMemberRepository.save(targetMember);
  }

  async removeMember(userId: string, groupId: string, memberId: string): Promise<void> {
    const callerMember = await this.groupMemberRepository
      .createQueryBuilder('member')
      .where('member.group_id = :groupId', { groupId })
      .andWhere('member.user_id = :userId', { userId })
      .getOne();
    if (!callerMember) {
      throw new ForbiddenException('You do not have access to this group');
    }
    if (callerMember.joinStatus !== 'active' && callerMember.joinStatus !== 'invited') {
      throw new ForbiddenException('You do not have access to this group');
    }

    const targetMember = await this.groupMemberRepository
      .createQueryBuilder('member')
      .leftJoinAndSelect('member.user', 'user')
      .where('member.id = :memberId', { memberId })
      .andWhere('member.group_id = :groupId', { groupId })
      .getOne();
    if (!targetMember) {
      throw new NotFoundException('Member record not found');
    }

    const isSelf = targetMember.user.id === userId;

    if (isSelf) {
      if (targetMember.role === 'owner') {
        throw new BadRequestException('Owner must transfer group ownership before leaving');
      }
      targetMember.joinStatus = 'left';
      targetMember.leftAt = new Date();
      await this.groupMemberRepository.save(targetMember);
    } else {
      if (callerMember.joinStatus !== 'active') {
        throw new ForbiddenException('You must accept the invitation first');
      }
      if (callerMember.role !== 'owner' && callerMember.role !== 'admin') {
        throw new ForbiddenException('Only owners and admins can remove members');
      }
      if (callerMember.role === 'admin' && (targetMember.role === 'owner' || targetMember.role === 'admin')) {
        throw new ForbiddenException('Admins cannot remove other admins or the owner');
      }

      targetMember.joinStatus = 'removed';
      targetMember.leftAt = new Date();
      await this.groupMemberRepository.save(targetMember);
    }
  }
}
