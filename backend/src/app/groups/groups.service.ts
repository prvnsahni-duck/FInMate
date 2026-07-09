import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  PreconditionFailedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, In } from 'typeorm';
import {
  Group,
  GroupKeyVersion,
  GroupMember,
  User,
  AuditLog,
  CreateGroupDto,
  UpdateGroupDto,
  InviteMemberDto,
  UpdateMemberDto,
  GroupMemberContribution,
  UpdateContributionDto,
  Expense,
  Settlement,
  GroupInvite,
  MemberWrappedGroupKey,
  RotateGroupKeyDto,
} from '@finmate/data-models';
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
    @InjectRepository(GroupInvite)
    private readonly groupInviteRepository: Repository<GroupInvite>,
    @InjectRepository(GroupKeyVersion)
    private readonly groupKeyVersionRepository: Repository<GroupKeyVersion>,
    @InjectRepository(MemberWrappedGroupKey)
    private readonly memberWrappedGroupKeyRepository: Repository<MemberWrappedGroupKey>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  private getIpHash(ip?: string): string | undefined {
    if (!ip) return undefined;
    return createHash('sha256').update(ip).digest('hex');
  }

  private isInviteExpired(invite: GroupInvite): boolean {
    return !!invite.expiresAt && invite.expiresAt.getTime() < Date.now();
  }

  private getWrappedGroupKeyMethod(wrappedGroupKey: string): 'RSA-OAEP' | 'TIK' {
    return wrappedGroupKey.includes(':') ? 'TIK' : 'RSA-OAEP';
  }

  private async getActiveMembership(
    userId: string,
    groupId: string,
  ): Promise<GroupMember> {
    const member = await this.groupMemberRepository.findOne({
      where: { group: { id: groupId }, user: { id: userId }, joinStatus: 'active' },
      relations: ['user', 'group'],
    });
    if (!member) {
      throw new BadRequestException('You do not have access to this group');
    }
    return member;
  }

  private async getActiveGroupKeyVersion(
    groupId: string,
    manager?: EntityManager,
  ): Promise<GroupKeyVersion | null> {
    const repo = manager
      ? manager.getRepository(GroupKeyVersion)
      : this.groupKeyVersionRepository;
    return repo.findOne({
      where: { group: { id: groupId }, status: 'ACTIVE' },
      relations: ['group'],
      order: { version: 'DESC' },
    });
  }

  private async ensureActiveGroupKeyVersion(
    group: Group,
    manager: EntityManager,
  ): Promise<GroupKeyVersion> {
    const existing = await this.getActiveGroupKeyVersion(group.id, manager);
    if (existing) {
      return existing;
    }

    return manager.getRepository(GroupKeyVersion).save(
      manager.getRepository(GroupKeyVersion).create({
        group,
        version: 1,
        algorithm: 'AES-256-GCM',
        status: 'ACTIVE',
      }),
    );
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

  async createGroup(
    owner: User,
    dto: CreateGroupDto,
    context?: { ip?: string; userAgent?: string },
  ): Promise<Group> {
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

      await this.ensureActiveGroupKeyVersion(savedGroup, manager);

      // Invite initial members if provided
      if (dto.members && dto.members.length > 0) {
        for (const initialMember of dto.members) {
          if (!initialMember.identifier) continue;
          let targetUser = await manager
            .getRepository(User)
            .createQueryBuilder('user')
            .where(
              'user.email = :id OR user.username = :id OR user.phoneNumber = :id',
              { id: initialMember.identifier },
            )
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
              const hasDigits = /^\+?[0-9\s-]{7,15}$/.test(
                initialMember.identifier,
              );
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

          if (
            targetUser &&
            targetUser.email &&
            !targetUser.email.endsWith('@placeholder.finmate')
          ) {
            const frontendUrl =
              this.configService.get<string>('FRONTEND_URL') ||
              'http://localhost:4200';
            const inviteUrl = `${frontendUrl}/groups/join/${savedGroup.inviteToken}`;
            const inviterName = owner.displayName || owner.email;
            this.emailService
              .sendInviteEmail(
                targetUser.email,
                savedGroup.name,
                inviteUrl,
                inviterName,
              )
              .catch((err) =>
                this.emailService['logger'].error(
                  `Failed to send invite email to ${targetUser.email} during group creation:`,
                  err,
                ),
              );
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
      metadata: {
        name: savedGroup.name,
        currency: savedGroup.currency,
        groupType: savedGroup.groupType,
      },
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

    return paginate(groups, total, page, limit, '/api/v1/groups', {
      isArchived,
    });
  }

  async findGroupById(userId: string, groupId: string): Promise<Group> {
    const membership = await this.groupMemberRepository
      .createQueryBuilder('member')
      .where('member.group_id = :groupId', { groupId })
      .andWhere('member.user_id = :userId', { userId })
      .andWhere('member.joinStatus = :status', { status: 'active' })
      .getOne();
    if (!membership) {
      const groupExists = await this.groupRepository.findOne({
        where: { id: groupId },
      });
      if (!groupExists) {
        throw new NotFoundException('Group not found');
      }
      throw new ForbiddenException('You do not have access to this group');
    }

    const group = await this.groupRepository.findOne({
      where: { id: groupId },
    });
    if (!group) {
      throw new NotFoundException('Group not found');
    }
    return group;
  }

  async updateGroup(
    userId: string,
    groupId: string,
    dto: UpdateGroupDto,
    context?: { ip?: string; userAgent?: string },
  ): Promise<Group> {
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
      throw new ForbiddenException(
        'Only owners and admins can edit group settings',
      );
    }

    const group = await this.groupRepository.findOne({
      where: { id: groupId },
    });
    if (!group) {
      throw new NotFoundException('Group not found');
    }

    // Concurrency Protection: Optimistic locking
    if (group.version !== dto.version) {
      throw new PreconditionFailedException({
        errorCode: 'CON_VERSION_CONFLICT',
        message:
          'Version conflict: the resource has been modified by another request',
      });
    }

    if (dto.name !== undefined) group.name = dto.name;
    if (dto.description !== undefined) group.description = dto.description;
    if (dto.visibility !== undefined) group.visibility = dto.visibility;
    if (dto.isArchived !== undefined) group.isArchived = dto.isArchived;
    if (dto.carryForwardEnabled !== undefined)
      group.carryForwardEnabled = dto.carryForwardEnabled;

    if (
      dto.currency !== undefined &&
      dto.currency.toUpperCase() !== group.currency.toUpperCase()
    ) {
      const expenseCount = await this.dataSource.getRepository(Expense).count({
        where: { group: { id: groupId } },
      });
      const settlementCount = await this.dataSource
        .getRepository(Settlement)
        .count({
          where: { group: { id: groupId } },
        });
      if (expenseCount > 0 || settlementCount > 0) {
        throw new BadRequestException({
          errorCode: 'GRP_CURRENCY_LOCKED',
          message:
            'Cannot update group base currency: expenses or settlements have already been recorded in this group.',
        });
      }
      group.currency = dto.currency.toUpperCase();
    }

    const savedGroup = await this.groupRepository.save(group);

    const actorUser = await this.dataSource
      .getRepository(User)
      .findOne({ where: { id: userId } });
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
    const group = await this.groupRepository.findOne({
      where: { id: groupId },
    });
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

  async inviteMember(
    userId: string,
    groupId: string,
    dto: InviteMemberDto,
    context?: { ip?: string; userAgent?: string },
  ): Promise<any> {
    const callerMember = await this.groupMemberRepository
      .createQueryBuilder('member')
      .leftJoinAndSelect('member.user', 'user')
      .where('member.group_id = :groupId', { groupId })
      .andWhere('member.user_id = :userId', { userId })
      .andWhere('member.joinStatus = :status', { status: 'active' })
      .getOne();
    if (
      !callerMember ||
      (callerMember.role !== 'owner' && callerMember.role !== 'admin')
    ) {
      throw new ForbiddenException('Only owners and admins can invite members');
    }

    const group = await this.groupRepository.findOne({
      where: { id: groupId },
    });
    if (!group) {
      throw new NotFoundException('Group not found');
    }

    let targetUser: User | null = null;

    if (dto.userId) {
      targetUser = await this.dataSource
        .getRepository(User)
        .findOne({ where: { id: dto.userId } });
    } else if (dto.identifier) {
      targetUser = await this.dataSource
        .getRepository(User)
        .createQueryBuilder('user')
        .where(
          'user.email = :id OR user.username = :id OR user.phoneNumber = :id',
          { id: dto.identifier },
        )
        .getOne();
    } else if (dto.email) {
      targetUser = await this.dataSource
        .getRepository(User)
        .findOne({ where: { email: dto.email } });
    }

    if (!targetUser) {
      const input = dto.identifier || dto.email;
      if (!input) {
        throw new BadRequestException(
          'Provide email, username, or phone number to invite',
        );
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
          targetUser = await this.dataSource
            .getRepository(User)
            .save(targetUser);
        } else {
          throw new NotFoundException(
            'User not found by the provided username/identifier',
          );
        }
      }
    }

    // Check existing membership
    const existingMember = await this.groupMemberRepository
      .createQueryBuilder('member')
      .leftJoinAndSelect('member.user', 'user')
      .where('member.group_id = :groupId', { groupId })
      .andWhere('member.user_id = :targetUserId', {
        targetUserId: targetUser.id,
      })
      .getOne();

    let savedMember: GroupMember;

    let inviteToken: string | undefined;

    if (existingMember) {
      if (
        existingMember.joinStatus === 'active' ||
        existingMember.joinStatus === 'invited'
      ) {
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

    if (dto.wrappedGroupKey) {
      const activeVersion =
        (await this.getActiveGroupKeyVersion(group.id)) ||
        (await this.dataSource.transaction((manager) =>
          this.ensureActiveGroupKeyVersion(group, manager),
        ));

      const wrappingMethod = this.getWrappedGroupKeyMethod(dto.wrappedGroupKey);

      if (wrappingMethod === 'RSA-OAEP') {
        const existingKey = await this.memberWrappedGroupKeyRepository.findOne({
          where: {
            groupKeyVersion: { id: activeVersion.id },
            user: { id: targetUser.id },
          },
        });
        if (!existingKey) {
          await this.memberWrappedGroupKeyRepository.save(
            this.memberWrappedGroupKeyRepository.create({
              groupKeyVersion: activeVersion,
              group,
              user: targetUser,
              wrappedGroupKey: dto.wrappedGroupKey,
              wrappingAlgorithm: wrappingMethod,
            }),
          );
        }
      } else {
        // TIK-wrapped keys must stay in the invite until the client joins,
        // unwraps with the URL hash TIK, and provisions a self-wrapped key.
        const token = randomUUID();
        inviteToken = token;
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

        await this.groupInviteRepository.save(
          this.groupInviteRepository.create({
            group,
            inviteToken: token,
            invitedEmail: targetUser.email,
            inviteeUser: targetUser,
            wrappedGroupKey: dto.wrappedGroupKey,
            groupKeyVersion: activeVersion,
            status: 'pending',
            expiresAt,
          }),
        );
      }
    }

    if (
      targetUser &&
      targetUser.email &&
      !targetUser.email.endsWith('@placeholder.finmate')
    ) {
      const frontendUrl =
        this.configService.get<string>('FRONTEND_URL') ||
        'http://localhost:4200';
      const token = inviteToken || group.inviteToken;
      const safeHash = (dto.inviteKeyHash ?? '').replace(/[^A-Za-z0-9_-]/g, '');
      const inviteUrl = safeHash
        ? `${frontendUrl}/groups/join/${token}#${safeHash}`
        : `${frontendUrl}/groups/join/${token}`;
      const inviterName =
        callerMember.user.displayName || callerMember.user.email;
      this.emailService
        .sendInviteEmail(targetUser.email, group.name, inviteUrl, inviterName)
        .catch((err) =>
          this.emailService['logger'].error(
            `Failed to send invite email to ${targetUser.email}:`,
            err,
          ),
        );
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

    return {
      member: savedMember,
      inviteToken: inviteToken || group.inviteToken,
    };
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
    if (
      callerMember.joinStatus !== 'active' &&
      callerMember.joinStatus !== 'invited'
    ) {
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
          const currentOwner = await manager
            .getRepository(GroupMember)
            .findOne({
              where: { group: { id: groupId }, role: 'owner' },
            });
          if (currentOwner && currentOwner.id !== targetMember.id) {
            currentOwner.role = 'admin';
            await manager.save(GroupMember, currentOwner);
          }

          targetMember.role = 'owner';
          targetMember.joinStatus = 'active'; // ensure active
          return manager.save(GroupMember, targetMember);
        });

        const actorUser = await this.dataSource
          .getRepository(User)
          .findOne({ where: { id: userId } });
        if (actorUser) {
          void this.writeAuditLog({
            actorUser,
            action: 'group.member_updated',
            entityId: saved.id,
            groupId,
            metadata: {
              memberEmail: targetMember.user?.email,
              role: 'owner',
              joinStatus: 'active',
            },
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
            throw new BadRequestException(
              'Owner must transfer group ownership before leaving',
            );
          }
          targetMember.joinStatus = 'left';
          targetMember.leftAt = new Date();
        } else {
          throw new BadRequestException(
            'Invalid join status transition for self',
          );
        }
      } else {
        if (dto.joinStatus === 'removed') {
          targetMember.joinStatus = 'removed';
          targetMember.leftAt = new Date();
        } else {
          throw new BadRequestException(
            'Can only transition status to removed',
          );
        }
      }
    }

    const savedMember = await this.groupMemberRepository.save(targetMember);

    const actorUser = await this.dataSource
      .getRepository(User)
      .findOne({ where: { id: userId } });
    if (actorUser) {
      void this.writeAuditLog({
        actorUser,
        action: 'group.member_updated',
        entityId: savedMember.id,
        groupId,
        metadata: {
          memberEmail: targetMember.user?.email,
          role: savedMember.role,
          joinStatus: savedMember.joinStatus,
        },
        ip: context?.ip,
        userAgent: context?.userAgent,
      });
    }

    return savedMember;
  }

  async removeMember(
    userId: string,
    groupId: string,
    memberId: string,
    context?: { ip?: string; userAgent?: string },
  ): Promise<void> {
    const callerMember = await this.groupMemberRepository
      .createQueryBuilder('member')
      .where('member.group_id = :groupId', { groupId })
      .andWhere('member.user_id = :userId', { userId })
      .getOne();
    if (!callerMember) {
      throw new ForbiddenException('You do not have access to this group');
    }
    if (
      callerMember.joinStatus !== 'active' &&
      callerMember.joinStatus !== 'invited'
    ) {
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
        throw new BadRequestException(
          'Owner must transfer group ownership before leaving',
        );
      }
      targetMember.joinStatus = 'left';
      targetMember.leftAt = new Date();
      const savedMember = await this.groupMemberRepository.save(targetMember);

      void this.writeAuditLog({
        actorUser: targetMember.user,
        action: 'group.member_left',
        entityId: savedMember.id,
        groupId,
        metadata: {
          memberEmail: targetMember.user.email,
          role: targetMember.role,
        },
        ip: context?.ip,
        userAgent: context?.userAgent,
      });
    } else {
      if (callerMember.joinStatus !== 'active') {
        throw new ForbiddenException('You must accept the invitation first');
      }
      if (callerMember.role !== 'owner' && callerMember.role !== 'admin') {
        throw new ForbiddenException(
          'Only owners and admins can remove members',
        );
      }
      if (
        callerMember.role === 'admin' &&
        (targetMember.role === 'owner' || targetMember.role === 'admin')
      ) {
        throw new ForbiddenException(
          'Admins cannot remove other admins or the owner',
        );
      }

      targetMember.joinStatus = 'removed';
      targetMember.leftAt = new Date();
      const savedMember = await this.groupMemberRepository.save(targetMember);

      const actorUser = await this.dataSource
        .getRepository(User)
        .findOne({ where: { id: userId } });
      if (actorUser) {
        void this.writeAuditLog({
          actorUser,
          action: 'group.member_removed',
          entityId: savedMember.id,
          groupId,
          metadata: {
            memberEmail: targetMember.user.email,
            role: targetMember.role,
          },
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
      const groupExists = await this.groupRepository.findOne({
        where: { id: groupId },
      });
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
    if (
      !membership ||
      (membership.role !== 'owner' && membership.role !== 'admin')
    ) {
      throw new ForbiddenException(
        'Only owners and admins can regenerate the invite token',
      );
    }

    const group = await this.groupRepository.findOne({
      where: { id: groupId },
    });
    if (!group) {
      throw new NotFoundException('Group not found');
    }
    group.inviteToken = randomUUID();
    return this.groupRepository.save(group);
  }

  async getInviteDetails(inviteToken: string) {
    // 1. Try group_invites first
    const invite = await this.groupInviteRepository.findOne({
      where: { inviteToken, status: 'pending' },
      relations: ['group', 'group.ownerUser', 'groupKeyVersion'],
    });

    if (invite) {
      if (this.isInviteExpired(invite)) {
        invite.status = 'expired';
        await this.groupInviteRepository.save(invite);
        throw new NotFoundException('Invalid or expired invitation link');
      }

      const group = invite.group;
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
        wrappedGroupKey: invite.wrappedGroupKey || null,
        groupKeyVersionId: invite.groupKeyVersion?.id ?? null,
        groupKeyVersion: invite.groupKeyVersion?.version ?? null,
        members: members.map((m) => ({
          displayName: m.user.displayName || null,
          email: m.user.email.endsWith('@placeholder.finmate')
            ? null
            : m.user.email,
          phoneNumber: m.user.phoneNumber || null,
          role: m.role,
          joinStatus: m.joinStatus,
        })),
      };
    }

    // 2. Fallback to groups.inviteToken lookup
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
      wrappedGroupKey: null,
      groupKeyVersionId: null,
      groupKeyVersion: null,
      members: members.map((m) => ({
        displayName: m.user.displayName || null,
        email: m.user.email.endsWith('@placeholder.finmate')
          ? null
          : m.user.email,
        phoneNumber: m.user.phoneNumber || null,
        role: m.role,
        joinStatus: m.joinStatus,
      })),
    };
  }

  async joinGroupByToken(
    userId: string,
    inviteToken: string,
    context?: { ip?: string; userAgent?: string },
  ): Promise<any> {
    // 1. Try finding in group_invites
    const invite = await this.groupInviteRepository.findOne({
      where: { inviteToken, status: 'pending' },
      relations: ['group', 'groupKeyVersion'],
    });

    let group: Group;
    let wrappedGroupKey: string | null = null;
    let groupKeyVersionId: string | null = null;
    let groupKeyVersion: number | null = null;

    if (invite) {
      if (this.isInviteExpired(invite)) {
        invite.status = 'expired';
        await this.groupInviteRepository.save(invite);
        throw new NotFoundException('Invalid or expired invitation link');
      }

      group = invite.group;
      wrappedGroupKey = invite.wrappedGroupKey || null;
      groupKeyVersionId = invite.groupKeyVersion?.id ?? null;
      groupKeyVersion = invite.groupKeyVersion?.version ?? null;
      invite.status = 'accepted';
      await this.groupInviteRepository.save(invite);
    } else {
      // 2. Fallback to groups.inviteToken
      const g = await this.groupRepository.findOne({
        where: { inviteToken },
      });
      if (!g) {
        throw new NotFoundException('Invalid or expired invitation link');
      }
      group = g;
    }

    const user = await this.dataSource
      .getRepository(User)
      .findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existingMember = await this.groupMemberRepository
      .createQueryBuilder('member')
      .where('member.group_id = :groupId', { groupId: group.id })
      .andWhere('member.user_id = :userId', { userId })
      .getOne();

    let savedMember: GroupMember;

    if (existingMember) {
      if (existingMember.joinStatus === 'active') {
        savedMember = existingMember;
      } else {
        existingMember.joinStatus = 'active';
        existingMember.joinedAt = new Date();
        existingMember.leftAt = undefined;
        savedMember = await this.groupMemberRepository.save(existingMember);

        void this.writeAuditLog({
          actorUser: user,
          action: 'group.member_joined',
          entityId: savedMember.id,
          groupId: group.id,
          metadata: { role: savedMember.role },
          ip: context?.ip,
          userAgent: context?.userAgent,
        });
      }
    } else {
      const newMember = this.groupMemberRepository.create({
        group,
        user,
        role: 'member',
        joinStatus: 'active',
        joinedAt: new Date(),
      });
      savedMember = await this.groupMemberRepository.save(newMember);

      void this.writeAuditLog({
        actorUser: user,
        action: 'group.member_joined',
        entityId: savedMember.id,
        groupId: group.id,
        metadata: { role: savedMember.role },
        ip: context?.ip,
        userAgent: context?.userAgent,
      });
    }


    return {
      member: savedMember,
      wrappedGroupKey,
      groupKeyVersionId,
      groupKeyVersion,
      groupId: group.id,
    };
  }

  async createGroupInvite(
    userId: string,
    groupId: string,
    dto: { wrappedGroupKey?: string },
  ) {
    const callerMember = await this.groupMemberRepository.findOne({
      where: { group: { id: groupId }, user: { id: userId }, joinStatus: 'active' },
    });
    if (!callerMember || (callerMember.role !== 'owner' && callerMember.role !== 'admin')) {
      throw new ForbiddenException('Only owners and admins can create invite links');
    }

    const group = await this.groupRepository.findOne({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException('Group not found');
    }

    const activeVersion =
      (await this.getActiveGroupKeyVersion(group.id)) ||
      (await this.dataSource.transaction((manager) =>
        this.ensureActiveGroupKeyVersion(group, manager),
      ));

    const inviteToken = randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    const invite = this.groupInviteRepository.create({
      group,
      inviteToken,
      wrappedGroupKey: dto.wrappedGroupKey,
      groupKeyVersion: activeVersion,
      status: 'pending',
      expiresAt,
    });

    const saved = await this.groupInviteRepository.save(invite);
    return {
      inviteToken: saved.inviteToken,
      expiresAt: saved.expiresAt,
    };
  }

  async provisionGroupKeys(
    userId: string,
    groupId: string,
    keys: Array<{ userId: string; wrappedKey: string }>,
  ): Promise<void> {
    const callerMember = await this.getActiveMembership(userId, groupId);
    const canProvisionOthers =
      callerMember.role === 'owner' || callerMember.role === 'admin';

    const group = await this.groupRepository.findOne({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException('Group not found');
    }

    await this.dataSource.transaction(async (manager) => {
      const activeVersion = await this.ensureActiveGroupKeyVersion(group, manager);

      for (const entry of keys) {
        const isSelfProvision = entry.userId === userId;
        if (!isSelfProvision && !canProvisionOthers) {
          throw new ForbiddenException(
            'Only owners and admins can provision group keys for other members',
          );
        }

        const targetMember = await manager.getRepository(GroupMember).findOne({
          where: {
            group: { id: groupId },
            user: { id: entry.userId },
            joinStatus: In(['active', 'invited']),
          },
        });
        if (!targetMember) {
          continue;
        }

        const existing = await manager.getRepository(MemberWrappedGroupKey).findOne({
          where: {
            groupKeyVersion: { id: activeVersion.id },
            user: { id: entry.userId },
          },
        });

        if (!existing) {
          await manager.getRepository(MemberWrappedGroupKey).save(
            manager.getRepository(MemberWrappedGroupKey).create({
              group,
              groupKeyVersion: activeVersion,
              user: { id: entry.userId } as User,
              wrappedGroupKey: entry.wrappedKey,
            }),
          );
        }
      }
    });
  }

  async getMyGroupKey(userId: string, groupId: string, versionId?: string) {
    await this.getActiveMembership(userId, groupId);

    let targetVersion: GroupKeyVersion | null = null;
    if (versionId) {
      targetVersion = await this.groupKeyVersionRepository.findOne({
        where: { id: versionId, group: { id: groupId } },
        relations: ['group'],
      });
      if (!targetVersion) {
        throw new BadRequestException({
          errorCode: 'GRP_KEY_VERSION_NOT_FOUND',
          message: `Requested group key version ${versionId} not found for group ${groupId}`,
        });
      }
    } else {
      targetVersion = await this.getActiveGroupKeyVersion(groupId);
    }

    if (!targetVersion) {
      return {
        groupId,
        userId,
        groupKeyVersionId: null,
        groupKeyVersion: null,
        wrappedKey: null,
      };
    }

    const key = await this.memberWrappedGroupKeyRepository.findOne({
      where: {
        groupKeyVersion: { id: targetVersion.id },
        user: { id: userId },
      },
    });

    // If a wrapped key is missing this is a backend data integrity problem.
    if (!key || !key.wrappedGroupKey) {
      const msg = `Missing wrapped key for user=${userId} group=${groupId} groupKeyVersionId=${targetVersion.id}`;
      // Log detailed context
      this.emailService['logger'].error(msg, {
        groupKeyVersion: targetVersion,
      });

      const env = this.configService.get<string>('NODE_ENV') || 'production';
      if (env === 'development' || env === 'dev') {
        throw new BadRequestException({
          errorCode: 'GRP_KEY_MISSING',
          message: msg,
          details: {
            groupKeyVersionId: targetVersion.id,
            groupKeyVersion: targetVersion.version,
            algorithm: targetVersion.algorithm,
          },
        });
      }

      // In production fail loudly but avoid leaking internals
      throw new BadRequestException({
        errorCode: 'GRP_KEY_MISSING',
        message: 'Wrapped group key unavailable for this member; contact support',
      });
    }

    return {
      groupId,
      userId,
      groupKeyVersionId: targetVersion.id,
      groupKeyVersion: targetVersion.version,
      wrappedKey: key.wrappedGroupKey,
    };
  }

  async getMissingGroupKeys(userId: string, groupId: string): Promise<string[]> {
    const callerMember = await this.getActiveMembership(userId, groupId);
    if (callerMember.role !== 'owner' && callerMember.role !== 'admin') {
      throw new ForbiddenException(
        'Only owners and admins can inspect missing group keys',
      );
    }

    const members = await this.groupMemberRepository.find({
      where: { group: { id: groupId }, joinStatus: In(['active', 'invited']) },
      relations: ['user'],
    });

    const activeVersion = await this.getActiveGroupKeyVersion(groupId);
    const existingKeys = activeVersion
      ? await this.memberWrappedGroupKeyRepository.find({
          where: { groupKeyVersion: { id: activeVersion.id } },
          relations: ['user'],
        })
      : [];

    const existingUserIds = new Set(existingKeys.map((k) => k.user?.id).filter(Boolean));
    return members
      .map((m) => m.user?.id)
      .filter((uid): uid is string => !!uid && !existingUserIds.has(uid));
  }

  async rotateGroupKey(
    userId: string,
    groupId: string,
    dto: RotateGroupKeyDto,
  ): Promise<{ groupId: string; groupKeyVersionId: string; groupKeyVersion: number; status: 'ACTIVE' }> {
    const callerMember = await this.getActiveMembership(userId, groupId);
    if (callerMember.role !== 'owner' && callerMember.role !== 'admin') {
      throw new ForbiddenException('Only owners and admins can rotate group keys');
    }
    if (!dto.keys || dto.keys.length === 0) {
      throw new BadRequestException('keys must be a non-empty array');
    }

    const group = await this.groupRepository.findOne({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException('Group not found');
    }

    const rotated = await this.dataSource.transaction(async (manager) => {
      const existingActive = await this.getActiveGroupKeyVersion(groupId, manager);
      if (existingActive) {
        existingActive.status = 'SUPERSEDED';
        existingActive.rotatedAt = new Date();
        existingActive.rotatedByUser = { id: userId } as User;
        existingActive.rotationReason = dto.reason;
        await manager.getRepository(GroupKeyVersion).save(existingActive);
      }

      const latest = await manager.getRepository(GroupKeyVersion).findOne({
        where: { group: { id: groupId } },
        order: { version: 'DESC' },
      });

      const nextVersion = (latest?.version ?? 0) + 1;
      const newVersion = await manager.getRepository(GroupKeyVersion).save(
        manager.getRepository(GroupKeyVersion).create({
          group,
          version: nextVersion,
          algorithm: 'AES-256-GCM',
          status: 'ACTIVE',
          rotationReason: dto.reason,
          rotatedByUser: { id: userId } as User,
        }),
      );

      // Validate keys cover all active members (invited or active)
      const members = await manager.getRepository(GroupMember).find({
        where: { group: { id: groupId }, joinStatus: In(['active', 'invited']) },
      });
      const memberIds = new Set(members.map((m) => m.user?.id).filter(Boolean));
      const providedIds = new Set(dto.keys.map((k) => k.userId));
      const missing = [...memberIds].filter((id) => !providedIds.has(id));
      if (missing.length > 0) {
        throw new BadRequestException({
          errorCode: 'GRP_ROTATION_MISSING_KEYS',
          message: 'Wrapped keys not provided for all active group members',
          missingUserIds: missing,
        });
      }

      for (const entry of dto.keys) {
        const targetMember = await manager.getRepository(GroupMember).findOne({
          where: {
            group: { id: groupId },
            user: { id: entry.userId },
            joinStatus: In(['active', 'invited']),
          },
        });
        if (!targetMember) {
          continue;
        }

        await manager.getRepository(MemberWrappedGroupKey).save(
          manager.getRepository(MemberWrappedGroupKey).create({
            group,
            groupKeyVersion: newVersion,
            user: { id: entry.userId } as User,
            wrappedGroupKey: entry.wrappedKey,
          }),
        );
      }

      return newVersion;
    });

    return {
      groupId,
      groupKeyVersionId: rotated.id,
      groupKeyVersion: rotated.version,
      status: 'ACTIVE',
    };
  }

  async getPendingInvitations(userId: string): Promise<any[]> {
    const memberships = await this.groupMemberRepository.find({
      where: { user: { id: userId }, joinStatus: 'invited' },
      relations: ['group', 'group.ownerUser'],
    });

    const results = [];
    for (const m of memberships) {
      const members = await this.groupMemberRepository.find({
        where: {
          group: { id: m.group.id },
          joinStatus: In(['active', 'invited']),
        },
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
          email: member.user.email.endsWith('@placeholder.finmate')
            ? null
            : member.user.email,
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

    const contributions = await this.dataSource
      .getRepository(GroupMemberContribution)
      .createQueryBuilder('contribution')
      .innerJoinAndSelect('contribution.groupMember', 'groupMember')
      .innerJoinAndSelect('groupMember.user', 'user')
      .where('groupMember.group_id = :groupId', { groupId })
      .andWhere('contribution.ledgerMonth = :ledgerMonth', { ledgerMonth })
      .getMany();

    const contributionsMap = new Map(
      contributions.map((c) => [c.groupMember.id, Number(c.percentage)]),
    );

    const result = activeMembers.map((m) => {
      const percentage =
        contributionsMap.get(m.id) ?? 100 / activeMembers.length;
      return {
        memberId: m.id,
        userId: m.user.id,
        displayName: m.user.displayName || m.user.email,
        percentage: Math.round(percentage * 100) / 100,
      };
    });

    return result;
  }

  async updateContributions(
    userId: string,
    groupId: string,
    dto: UpdateContributionDto,
  ) {
    const callerMember = await this.groupMemberRepository
      .createQueryBuilder('member')
      .where('member.group_id = :groupId', { groupId })
      .andWhere('member.user_id = :userId', { userId })
      .andWhere('member.joinStatus = :status', { status: 'active' })
      .getOne();
    if (
      !callerMember ||
      (callerMember.role !== 'owner' && callerMember.role !== 'admin')
    ) {
      throw new ForbiddenException(
        'Only owners and admins can update contribution settings',
      );
    }

    const totalPercentage = dto.contributions.reduce(
      (sum, c) => sum + Number(c.percentage),
      0,
    );
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
          throw new BadRequestException(
            `Member ID ${contributionInput.memberId} does not belong to this group`,
          );
        }

        let contribution = await manager
          .getRepository(GroupMemberContribution)
          .findOne({
            where: {
              groupMember: { id: member.id },
              ledgerMonth: dto.ledgerMonth,
            },
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

        savedContributions.push(
          await manager.save(GroupMemberContribution, contribution),
        );
      }

      return savedContributions;
    });
  }
}
