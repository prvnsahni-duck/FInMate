import { Injectable, NotFoundException, ForbiddenException, PreconditionFailedException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Group, GroupMember, User, AuditLog, CreateGroupDto, UpdateGroupDto, InviteMemberDto, UpdateMemberDto, GroupMemberContribution, UpdateContributionDto, Expense, Settlement } from '@finmate/data-models';
import { createHash } from 'crypto';
import { paginate, PaginatedResponse } from '../common/pagination.util';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../email/email.service';

@Injectable()
export class GroupsService {
  constructor(
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    @InjectRepository(GroupMember)
    private readonly groupMemberRepository: Repository<GroupMember>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  private getIpHash(ip?: string): string | undefined {
    if (!ip) return undefined;
    return createHash('sha256').update(ip).digest('hex');
  }

  private async writeAuditLog(opts: {
    actorUser: User;
    action: string;
    entityId: string;
    groupId?: string;
    metadata?: Record<string, unknown>;
    ip?: string;
    userAgent?: string;
  }): Promise<void> {
    try {
      const meta = { ...opts.metadata };
      if (opts.userAgent) {
        meta.userAgent = opts.userAgent;
      }
      await this.auditLogRepository.save(
        this.auditLogRepository.create({
          actorUser: opts.actorUser,
          action: opts.action,
          entityType: 'group',
          entityId: opts.entityId,
          scope: opts.groupId ? 'group' : 'personal',
          group: opts.groupId ? ({ id: opts.groupId } as Group) : undefined,
          metadataJson: meta,
          ipHash: this.getIpHash(opts.ip),
        }),
      );
    } catch {
      // Audit log failures should never block the primary operation
    }
  }

  async createGroup(owner: User, dto: CreateGroupDto, context?: { ip?: string; userAgent?: string }): Promise<Group> {
    const savedGroup = await this.dataSource.transaction(async (manager) => {
      const group = manager.create(Group, {
        name: dto.name,
        description: dto.description,
        visibility: dto.visibility || 'private',
        currency: dto.currency || 'USD',
        groupType: dto.groupType || 'normal',
        carryForwardEnabled: dto.carryForwardEnabled ?? false,
        ownerUser: owner,
        inviteToken: randomUUID(),
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

      // Invite initial members if provided
      if (dto.members && dto.members.length > 0) {
        for (const initialMember of dto.members) {
          if (!initialMember.identifier) continue;
          let targetUser = await manager.getRepository(User)
            .createQueryBuilder('user')
            .where('user.email = :id OR user.username = :id OR user.phoneNumber = :id', { id: initialMember.identifier })
            .getOne();

          if (!targetUser) {
            const isEmail = initialMember.identifier.includes('@');
            if (isEmail) {
              const dummyPassword = await argon2.hash(randomUUID());
              targetUser = manager.getRepository(User).create({
                email: initialMember.identifier,
                passwordHash: dummyPassword,
                status: 'invited',
              });
              targetUser = await manager.save(User, targetUser);
            } else {
              const hasDigits = /^\+?[0-9\s-]{7,15}$/.test(initialMember.identifier);
              if (hasDigits) {
                const dummyPassword = await argon2.hash(randomUUID());
                targetUser = manager.getRepository(User).create({
                  email: `${initialMember.identifier}@placeholder.finmate`,
                  phoneNumber: initialMember.identifier,
                  passwordHash: dummyPassword,
                  status: 'invited',
                });
                targetUser = await manager.save(User, targetUser);
              } else {
                continue; // Skip invalid usernames/identifiers
              }
            }
          }
          const newMember = manager.create(GroupMember, {
            group: savedGroup,
            user: targetUser,
            role: initialMember.role || 'member',
            joinStatus: 'invited',
          });
          await manager.save(GroupMember, newMember);

          if (targetUser && targetUser.email && !targetUser.email.endsWith('@placeholder.finmate')) {
            const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:4200';
            const inviteUrl = `${frontendUrl}/groups/join/${savedGroup.inviteToken}`;
            const inviterName = owner.displayName || owner.email;
            this.emailService.sendInviteEmail(targetUser.email, savedGroup.name, inviteUrl, inviterName)
              .catch(err => this.emailService['logger'].error(`Failed to send invite email to ${targetUser.email} during group creation:`, err));
          }
        }
      }

      return savedGroup;
    });

    void this.writeAuditLog({
      actorUser: owner,
      action: 'group.created',
      entityId: savedGroup.id,
      groupId: savedGroup.id,
      metadata: { name: savedGroup.name, currency: savedGroup.currency, groupType: savedGroup.groupType },
      ip: context?.ip,
      userAgent: context?.userAgent,
    });

    return savedGroup;
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

  async updateGroup(userId: string, groupId: string, dto: UpdateGroupDto, context?: { ip?: string; userAgent?: string }): Promise<Group> {
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
    if (dto.carryForwardEnabled !== undefined) group.carryForwardEnabled = dto.carryForwardEnabled;

    if (dto.currency !== undefined && dto.currency.toUpperCase() !== group.currency.toUpperCase()) {
      const expenseCount = await this.dataSource.getRepository(Expense).count({
        where: { group: { id: groupId } }
      });
      const settlementCount = await this.dataSource.getRepository(Settlement).count({
        where: { group: { id: groupId } }
      });
      if (expenseCount > 0 || settlementCount > 0) {
        throw new BadRequestException({
          errorCode: 'GRP_CURRENCY_LOCKED',
          message: 'Cannot update group base currency: expenses or settlements have already been recorded in this group.'
        });
      }
      group.currency = dto.currency.toUpperCase();
    }

    const savedGroup = await this.groupRepository.save(group);

    const actorUser = await this.dataSource.getRepository(User).findOne({ where: { id: userId } });
    if (actorUser) {
      void this.writeAuditLog({
        actorUser,
        action: 'group.updated',
        entityId: savedGroup.id,
        groupId: savedGroup.id,
        metadata: {
          name: savedGroup.name,
          currency: savedGroup.currency,
          carryForwardEnabled: savedGroup.carryForwardEnabled,
          isArchived: savedGroup.isArchived,
        },
        ip: context?.ip,
        userAgent: context?.userAgent,
      });
    }

    return savedGroup;
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

  async inviteMember(userId: string, groupId: string, dto: InviteMemberDto, context?: { ip?: string; userAgent?: string }): Promise<GroupMember> {
    const callerMember = await this.groupMemberRepository
      .createQueryBuilder('member')
      .leftJoinAndSelect('member.user', 'user')
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

    let targetUser: User | null = null;

    if (dto.userId) {
      targetUser = await this.dataSource.getRepository(User).findOne({ where: { id: dto.userId } });
    } else if (dto.identifier) {
      targetUser = await this.dataSource.getRepository(User)
        .createQueryBuilder('user')
        .where('user.email = :id OR user.username = :id OR user.phoneNumber = :id', { id: dto.identifier })
        .getOne();
    } else if (dto.email) {
      targetUser = await this.dataSource.getRepository(User).findOne({ where: { email: dto.email } });
    }

    if (!targetUser) {
      const input = dto.identifier || dto.email;
      if (!input) {
        throw new BadRequestException('Provide email, username, or phone number to invite');
      }

      const isEmail = input.includes('@');
      if (isEmail) {
        const dummyPassword = await argon2.hash(randomUUID());
        targetUser = this.dataSource.getRepository(User).create({
          email: input,
          passwordHash: dummyPassword,
          status: 'invited',
          displayName: dto.displayName,
        });
        targetUser = await this.dataSource.getRepository(User).save(targetUser);
      } else {
        const hasDigits = /^\+?[0-9\s-]{7,15}$/.test(input);
        if (hasDigits) {
          const dummyPassword = await argon2.hash(randomUUID());
          targetUser = this.dataSource.getRepository(User).create({
            email: `${input}@placeholder.finmate`,
            phoneNumber: input,
            passwordHash: dummyPassword,
            status: 'invited',
            displayName: dto.displayName,
          });
          targetUser = await this.dataSource.getRepository(User).save(targetUser);
        } else {
          throw new NotFoundException('User not found by the provided username/identifier');
        }
      }
    }

    // Check existing membership
    const existingMember = await this.groupMemberRepository
      .createQueryBuilder('member')
      .leftJoinAndSelect('member.user', 'user')
      .where('member.group_id = :groupId', { groupId })
      .andWhere('member.user_id = :targetUserId', { targetUserId: targetUser.id })
      .getOne();

    let savedMember: GroupMember;

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
      savedMember = await this.groupMemberRepository.save(existingMember);
    } else {
      const newMember = this.groupMemberRepository.create({
        group,
        user: targetUser,
        role: dto.role || 'member',
        joinStatus: 'invited',
      });
      savedMember = await this.groupMemberRepository.save(newMember);
    }

    if (targetUser && targetUser.email && !targetUser.email.endsWith('@placeholder.finmate')) {
      const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:4200';
      const inviteUrl = `${frontendUrl}/groups/join/${group.inviteToken}`;
      const inviterName = callerMember.user.displayName || callerMember.user.email;
      this.emailService.sendInviteEmail(targetUser.email, group.name, inviteUrl, inviterName)
        .catch(err => this.emailService['logger'].error(`Failed to send invite email to ${targetUser.email}:`, err));
    }

    void this.writeAuditLog({
      actorUser: callerMember.user,
      action: 'group.member_invited',
      entityId: savedMember.id,
      groupId: group.id,
      metadata: { invitedEmail: targetUser.email, role: savedMember.role },
      ip: context?.ip,
      userAgent: context?.userAgent,
    });

    return savedMember;
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
    context?: { ip?: string; userAgent?: string },
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

    // Role can be changed by any member, to any role, at any time
    if (dto.role) {
      if (dto.role === 'owner') {
        // If promoting to owner, demote current owner to admin in a transaction
        const saved = await this.dataSource.transaction(async (manager) => {
          const currentOwner = await manager.getRepository(GroupMember).findOne({
            where: { group: { id: groupId }, role: 'owner' }
          });
          if (currentOwner && currentOwner.id !== targetMember.id) {
            currentOwner.role = 'admin';
            await manager.save(GroupMember, currentOwner);
          }

          targetMember.role = 'owner';
          targetMember.joinStatus = 'active'; // ensure active
          return manager.save(GroupMember, targetMember);
        });

        const actorUser = await this.dataSource.getRepository(User).findOne({ where: { id: userId } });
        if (actorUser) {
          void this.writeAuditLog({
            actorUser,
            action: 'group.member_updated',
            entityId: saved.id,
            groupId,
            metadata: { memberEmail: targetMember.user?.email, role: 'owner', joinStatus: 'active' },
            ip: context?.ip,
            userAgent: context?.userAgent,
          });
        }
        return saved;
      }
      targetMember.role = dto.role;
    }

    // Handle join status updates
    if (dto.joinStatus) {
      const isSelf = targetMember.user.id === userId;
      if (isSelf) {
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
      } else {
        if (dto.joinStatus === 'removed') {
          targetMember.joinStatus = 'removed';
          targetMember.leftAt = new Date();
        } else {
          throw new BadRequestException('Can only transition status to removed');
        }
      }
    }

    const savedMember = await this.groupMemberRepository.save(targetMember);

    const actorUser = await this.dataSource.getRepository(User).findOne({ where: { id: userId } });
    if (actorUser) {
      void this.writeAuditLog({
        actorUser,
        action: 'group.member_updated',
        entityId: savedMember.id,
        groupId,
        metadata: { memberEmail: targetMember.user?.email, role: savedMember.role, joinStatus: savedMember.joinStatus },
        ip: context?.ip,
        userAgent: context?.userAgent,
      });
    }

    return savedMember;
  }

  async removeMember(userId: string, groupId: string, memberId: string, context?: { ip?: string; userAgent?: string }): Promise<void> {
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
      const savedMember = await this.groupMemberRepository.save(targetMember);

      void this.writeAuditLog({
        actorUser: targetMember.user,
        action: 'group.member_left',
        entityId: savedMember.id,
        groupId,
        metadata: { memberEmail: targetMember.user.email, role: targetMember.role },
        ip: context?.ip,
        userAgent: context?.userAgent,
      });
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
      const savedMember = await this.groupMemberRepository.save(targetMember);

      const actorUser = await this.dataSource.getRepository(User).findOne({ where: { id: userId } });
      if (actorUser) {
        void this.writeAuditLog({
          actorUser,
          action: 'group.member_removed',
          entityId: savedMember.id,
          groupId,
          metadata: { memberEmail: targetMember.user.email, role: targetMember.role },
          ip: context?.ip,
          userAgent: context?.userAgent,
        });
      }
    }
  }

  /**
   * Get paginated audit history for a group.
   * Returns all expense create/update/delete/restore events for this group.
   */
  async getGroupHistory(
    userId: string,
    groupId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<Record<string, unknown>>> {
    // Verify caller has access
    const membership = await this.groupMemberRepository
      .createQueryBuilder('member')
      .where('member.group_id = :groupId', { groupId })
      .andWhere('member.user_id = :userId', { userId })
      .andWhere('member.joinStatus = :status', { status: 'active' })
      .getOne();
    if (!membership) {
      const groupExists = await this.groupRepository.findOne({ where: { id: groupId } });
      if (!groupExists) throw new NotFoundException('Group not found');
      throw new ForbiddenException('You do not have access to this group');
    }

    const p = page > 0 ? page : 1;
    const l = limit > 0 ? limit : 20;

    const [logs, total] = await this.auditLogRepository
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.actorUser', 'actorUser')
      .where('log.group = :groupId', { groupId })
      .orderBy('log.createdAt', 'DESC')
      .skip((p - 1) * l)
      .take(l)
      .getManyAndCount();

    const data = logs.map((log) => ({
      id: log.id,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      actorUserId: log.actorUser?.id ?? null,
      actorDisplayName: log.actorUser?.displayName ?? null,
      metadata: log.metadataJson ?? null,
      createdAt: log.createdAt,
    }));

    return paginate(data, total, p, l, `/api/v1/groups/${groupId}/history`, {});
  }

  async regenerateInviteToken(userId: string, groupId: string): Promise<Group> {
    const membership = await this.groupMemberRepository
      .createQueryBuilder('member')
      .where('member.group_id = :groupId', { groupId })
      .andWhere('member.user_id = :userId', { userId })
      .andWhere('member.joinStatus = :status', { status: 'active' })
      .getOne();
    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
      throw new ForbiddenException('Only owners and admins can regenerate the invite token');
    }

    const group = await this.groupRepository.findOne({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException('Group not found');
    }
    group.inviteToken = randomUUID();
    return this.groupRepository.save(group);
  }

  async getInviteDetails(inviteToken: string) {
    const group = await this.groupRepository.findOne({
      where: { inviteToken },
      relations: ['ownerUser'],
    });
    if (!group) {
      throw new NotFoundException('Invalid or expired invitation link');
    }

    const members = await this.groupMemberRepository.find({
      where: { group: { id: group.id }, joinStatus: In(['active', 'invited']) },
      relations: ['user'],
    });

    return {
      id: group.id,
      name: group.name,
      description: group.description,
      currency: group.currency,
      groupType: group.groupType,
      ownerName: group.ownerUser.displayName || group.ownerUser.email,
      members: members.map((m) => ({
        displayName: m.user.displayName || null,
        email: m.user.email.endsWith('@placeholder.finmate') ? null : m.user.email,
        phoneNumber: m.user.phoneNumber || null,
        role: m.role,
        joinStatus: m.joinStatus,
      })),
    };
  }

  async joinGroupByToken(userId: string, inviteToken: string, context?: { ip?: string; userAgent?: string }): Promise<GroupMember> {
    const group = await this.groupRepository.findOne({ where: { inviteToken } });
    if (!group) {
      throw new NotFoundException('Invalid or expired invitation link');
    }

    const user = await this.dataSource.getRepository(User).findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existingMember = await this.groupMemberRepository
      .createQueryBuilder('member')
      .where('member.group_id = :groupId', { groupId: group.id })
      .andWhere('member.user_id = :userId', { userId })
      .getOne();

    if (existingMember) {
      if (existingMember.joinStatus === 'active') {
        return existingMember;
      }
      existingMember.joinStatus = 'active';
      existingMember.joinedAt = new Date();
      existingMember.leftAt = undefined;
      const savedMember = await this.groupMemberRepository.save(existingMember);

      void this.writeAuditLog({
        actorUser: user,
        action: 'group.member_joined',
        entityId: savedMember.id,
        groupId: group.id,
        metadata: { role: savedMember.role },
        ip: context?.ip,
        userAgent: context?.userAgent,
      });

      return savedMember;
    }

    const newMember = this.groupMemberRepository.create({
      group,
      user,
      role: 'member',
      joinStatus: 'active',
      joinedAt: new Date(),
    });
    const savedMember = await this.groupMemberRepository.save(newMember);

    void this.writeAuditLog({
      actorUser: user,
      action: 'group.member_joined',
      entityId: savedMember.id,
      groupId: group.id,
      metadata: { role: savedMember.role },
      ip: context?.ip,
      userAgent: context?.userAgent,
    });

    return savedMember;
  }

  async getPendingInvitations(userId: string): Promise<any[]> {
    const memberships = await this.groupMemberRepository.find({
      where: { user: { id: userId }, joinStatus: 'invited' },
      relations: ['group', 'group.ownerUser'],
    });

    const results = [];
    for (const m of memberships) {
      const members = await this.groupMemberRepository.find({
        where: { group: { id: m.group.id }, joinStatus: In(['active', 'invited']) },
        relations: ['user'],
      });

      results.push({
        id: m.group.id,
        membershipId: m.id,
        name: m.group.name,
        description: m.group.description,
        currency: m.group.currency,
        groupType: m.group.groupType,
        ownerName: m.group.ownerUser.displayName || m.group.ownerUser.email,
        members: members.map((member) => ({
          displayName: member.user.displayName || null,
          email: member.user.email.endsWith('@placeholder.finmate') ? null : member.user.email,
          phoneNumber: member.user.phoneNumber || null,
          role: member.role,
          joinStatus: member.joinStatus,
        })),
      });
    }

    return results;
  }

  async getContributions(userId: string, groupId: string, ledgerMonth: string) {
    const callerMember = await this.groupMemberRepository
      .createQueryBuilder('member')
      .where('member.group_id = :groupId', { groupId })
      .andWhere('member.user_id = :userId', { userId })
      .andWhere('member.joinStatus = :status', { status: 'active' })
      .getOne();
    if (!callerMember) {
      throw new ForbiddenException('You do not have access to this group');
    }

    const activeMembers = await this.groupMemberRepository.find({
      where: { group: { id: groupId }, joinStatus: 'active' },
      relations: ['user'],
    });

    const contributions = await this.dataSource.getRepository(GroupMemberContribution)
      .createQueryBuilder('contribution')
      .innerJoinAndSelect('contribution.groupMember', 'groupMember')
      .innerJoinAndSelect('groupMember.user', 'user')
      .where('groupMember.group_id = :groupId', { groupId })
      .andWhere('contribution.ledgerMonth = :ledgerMonth', { ledgerMonth })
      .getMany();

    const contributionsMap = new Map(contributions.map(c => [c.groupMember.id, Number(c.percentage)]));

    const result = activeMembers.map(m => {
      const percentage = contributionsMap.get(m.id) ?? (100 / activeMembers.length);
      return {
        memberId: m.id,
        userId: m.user.id,
        displayName: m.user.displayName || m.user.email,
        percentage: Math.round(percentage * 100) / 100,
      };
    });

    return result;
  }

  async updateContributions(userId: string, groupId: string, dto: UpdateContributionDto) {
    const callerMember = await this.groupMemberRepository
      .createQueryBuilder('member')
      .where('member.group_id = :groupId', { groupId })
      .andWhere('member.user_id = :userId', { userId })
      .andWhere('member.joinStatus = :status', { status: 'active' })
      .getOne();
    if (!callerMember || (callerMember.role !== 'owner' && callerMember.role !== 'admin')) {
      throw new ForbiddenException('Only owners and admins can update contribution settings');
    }

    const totalPercentage = dto.contributions.reduce((sum, c) => sum + Number(c.percentage), 0);
    if (Math.round(totalPercentage * 100) !== 10000) {
      throw new BadRequestException({
        errorCode: 'VAL_INVALID_INPUT',
        message: 'Total contribution percentages must sum to exactly 100.00%',
      });
    }

    return this.dataSource.transaction(async (manager) => {
      const savedContributions: GroupMemberContribution[] = [];

      for (const contributionInput of dto.contributions) {
        const member = await manager.getRepository(GroupMember).findOne({
          where: { id: contributionInput.memberId, group: { id: groupId } },
        });
        if (!member) {
          throw new BadRequestException(`Member ID ${contributionInput.memberId} does not belong to this group`);
        }

        let contribution = await manager.getRepository(GroupMemberContribution).findOne({
          where: { groupMember: { id: member.id }, ledgerMonth: dto.ledgerMonth },
        });

        if (contribution) {
          contribution.percentage = contributionInput.percentage;
        } else {
          contribution = manager.getRepository(GroupMemberContribution).create({
            groupMember: member,
            ledgerMonth: dto.ledgerMonth,
            percentage: contributionInput.percentage,
          });
        }

        savedContributions.push(await manager.save(GroupMemberContribution, contribution));
      }

      return savedContributions;
    });
  }
}
