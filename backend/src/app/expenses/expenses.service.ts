import { BadRequestException, ForbiddenException, Injectable, NotFoundException, PreconditionFailedException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Attachment, Expense, ExpenseSplit, Group, GroupMember, User } from '@finmate/data-models';
import { Brackets, DataSource, EntityManager, In, Repository } from 'typeorm';
import { paginate, PaginatedResponse } from '../common/pagination.util';
import { calculateDeterministicSplits } from './split-calculator.util';
import { CreateExpenseDto, UpdateExpenseDto } from './dto';

interface ExpenseListParams {
  page: number;
  limit: number;
  cursor?: string;
  groupId?: string;
  category?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

@Injectable()
export class ExpensesService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(Expense)
    private readonly expenseRepository: Repository<Expense>,
    @InjectRepository(ExpenseSplit)
    private readonly expenseSplitRepository: Repository<ExpenseSplit>,
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    @InjectRepository(GroupMember)
    private readonly groupMemberRepository: Repository<GroupMember>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Attachment)
    private readonly attachmentRepository: Repository<Attachment>,
  ) {}

  private basename(value: string): string {
    const parts = value.split('/').filter(Boolean);
    return parts[parts.length - 1] || value;
  }

  private isValidDateFormat(value?: string): boolean {
    if (!value) return true;
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  private async getGroupMembership(userId: string, groupId: string): Promise<GroupMember | null> {
    return this.groupMemberRepository.findOne({
      where: { group: { id: groupId }, user: { id: userId }, joinStatus: In(['active', 'invited']) },
      relations: ['user', 'group'],
    });
  }

  private async buildGroupParticipantMaps(groupId: string, manager: EntityManager): Promise<{
    groupMemberById: Map<string, GroupMember>;
    activeOrInvitedByUserId: Map<string, GroupMember>;
  }> {
    const members = await manager.getRepository(GroupMember).find({
      where: { group: { id: groupId }, joinStatus: In(['active', 'invited']) },
      relations: ['user'],
    });

    const groupMemberById = new Map<string, GroupMember>();
    const activeOrInvitedByUserId = new Map<string, GroupMember>();

    for (const member of members) {
      groupMemberById.set(member.id, member);
      activeOrInvitedByUserId.set(member.user.id, member);
    }

    return { groupMemberById, activeOrInvitedByUserId };
  }

  private async ensureExpenseAccess(userId: string, expense: Expense, write = false): Promise<void> {
    if (!expense.group) {
      if (expense.ownerUser.id !== userId) {
        throw new ForbiddenException('You do not have access to this expense');
      }
      return;
    }

    const membership = await this.getGroupMembership(userId, expense.group.id);
    if (!membership) {
      throw new ForbiddenException('You do not have access to this expense');
    }

    if (write) {
      if (membership.joinStatus !== 'active') {
        throw new ForbiddenException('You must accept the invitation first');
      }
      if (membership.role === 'viewer') {
        throw new ForbiddenException('Viewers cannot modify expenses');
      }

      const group = await this.groupRepository.findOne({ where: { id: expense.group.id } });
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

  private async mapExpenseResponse(expense: Expense): Promise<any> {
    const splits = await this.expenseSplitRepository.find({
      where: { expense: { id: expense.id } },
      relations: ['participantUser', 'participantGroupMember'],
      order: { createdAt: 'ASC' },
    });

    const attachments = await this.attachmentRepository.find({
      where: { expense: { id: expense.id } },
      relations: ['uploaderUser'],
      order: { createdAt: 'ASC' },
    });

    return {
      id: expense.id,
      title: expense.title,
      description: expense.description ?? null,
      amountTotal: Number(expense.amountTotal),
      currency: expense.currency,
      category: expense.category,
      paidByUserId: expense.paidByUser.id,
      ownerUserId: expense.ownerUser.id,
      groupId: expense.group?.id ?? null,
      expenseDate: expense.expenseDate,
      status: expense.status,
      splits: splits.map((split) => ({
        id: split.id,
        expenseId: expense.id,
        participantUserId: split.participantUser?.id ?? null,
        participantGroupMemberId: split.participantGroupMember?.id ?? null,
        splitType: split.splitType,
        shareValue: Number(split.shareValue),
        amountOwed: Number(split.amountOwed),
        isSettled: split.isSettled,
        settledAt: split.settledAt ?? null,
        createdAt: split.createdAt,
        updatedAt: split.updatedAt,
      })),
      attachments: attachments.map((attachment) => ({
        id: attachment.id,
        uploaderUserId: attachment.uploaderUser.id,
        expenseId: expense.id,
        noteId: null,
        goalId: null,
        groupId: expense.group?.id ?? null,
        storageKey: attachment.storageKey,
        originalName: attachment.originalName,
        mimeType: attachment.mimeType,
        sizeBytes: Number(attachment.sizeBytes),
        checksumSha256: attachment.checksumSha256 ?? null,
        createdAt: attachment.createdAt,
      })),
      version: expense.version,
      createdAt: expense.createdAt,
      updatedAt: expense.updatedAt,
    };
  }

  private async persistSplits(
    expense: Expense,
    dto: Pick<CreateExpenseDto, 'splits' | 'amountTotal' | 'paidByUserId' | 'groupId'>,
    manager: EntityManager,
  ): Promise<void> {
    const payerKey = dto.groupId
      ? (await manager.getRepository(GroupMember).findOne({
          where: { group: { id: dto.groupId }, user: { id: dto.paidByUserId }, joinStatus: In(['active', 'invited']) },
        }))?.id
      : dto.paidByUserId;

    const calculated = calculateDeterministicSplits(dto.amountTotal, dto.splits, payerKey);

    if (!dto.groupId) {
      const participantIds = [...new Set(dto.splits.map((split) => split.participantUserId || ''))].filter(Boolean);
      const users = await manager.getRepository(User).find({ where: { id: In(participantIds) } });
      const userMap = new Map(users.map((u) => [u.id, u]));

      for (const split of calculated) {
        const participantUser = split.participantUserId ? userMap.get(split.participantUserId) : undefined;
        if (!participantUser) {
          throw new BadRequestException({
            errorCode: 'VAL_INVALID_INPUT',
            message: 'Personal expense participants must be valid users',
          });
        }

        await manager.getRepository(ExpenseSplit).save(
          manager.getRepository(ExpenseSplit).create({
            expense,
            participantUser,
            splitType: split.splitType,
            shareValue: split.shareValue,
            amountOwed: split.amountOwed,
            isSettled: false,
          }),
        );
      }
      return;
    }

    const { groupMemberById, activeOrInvitedByUserId } = await this.buildGroupParticipantMaps(dto.groupId, manager);

    for (const split of calculated) {
      const participantGroupMember = split.participantGroupMemberId
        ? groupMemberById.get(split.participantGroupMemberId)
        : undefined;
      const participantByUser = split.participantUserId
        ? activeOrInvitedByUserId.get(split.participantUserId)
        : undefined;

      if (!participantGroupMember && !participantByUser) {
        throw new BadRequestException({
          errorCode: 'VAL_INVALID_INPUT',
          message: 'Each split participant must belong to the selected group',
        });
      }

      await manager.getRepository(ExpenseSplit).save(
        manager.getRepository(ExpenseSplit).create({
          expense,
          participantUser: participantByUser?.user,
          participantGroupMember: participantGroupMember || participantByUser,
          splitType: split.splitType,
          shareValue: split.shareValue,
          amountOwed: split.amountOwed,
          isSettled: false,
        }),
      );
    }
  }

  async createExpense(userId: string, dto: CreateExpenseDto): Promise<any> {
    const ownerUser = await this.userRepository.findOne({ where: { id: userId } });
    if (!ownerUser) {
      throw new NotFoundException('User not found');
    }

    const paidByUser = await this.userRepository.findOne({ where: { id: dto.paidByUserId } });
    if (!paidByUser) {
      throw new BadRequestException({
        errorCode: 'VAL_INVALID_INPUT',
        message: 'paidByUserId must reference an existing user',
      });
    }

    let group: Group | undefined;

    if (dto.groupId) {
      const membership = await this.getGroupMembership(userId, dto.groupId);
      if (!membership) {
        throw new ForbiddenException('You do not have access to this group');
      }
      if (membership.joinStatus !== 'active') {
        throw new ForbiddenException('You must accept the invitation first');
      }
      if (membership.role === 'viewer') {
        throw new ForbiddenException('Viewers cannot create expenses');
      }

      group = await this.groupRepository.findOne({ where: { id: dto.groupId } });
      if (!group) {
        throw new NotFoundException('Group not found');
      }
      if (group.isArchived) {
        throw new ForbiddenException({
          errorCode: 'RES_FORBIDDEN',
          message: 'Group is archived and read-only',
        });
      }

      const payerInGroup = await this.groupMemberRepository.findOne({
        where: { group: { id: dto.groupId }, user: { id: dto.paidByUserId }, joinStatus: In(['active', 'invited']) },
      });
      if (!payerInGroup) {
        throw new BadRequestException({
          errorCode: 'VAL_INVALID_INPUT',
          message: 'paidByUserId must belong to the selected group',
        });
      }
    } else {
      if (dto.paidByUserId !== userId) {
        throw new ForbiddenException('Personal expenses must be paid by the authenticated user');
      }
      const hasGroupMemberParticipant = dto.splits.some((split) => !!split.participantGroupMemberId);
      if (hasGroupMemberParticipant) {
        throw new BadRequestException({
          errorCode: 'VAL_INVALID_INPUT',
          message: 'Personal expenses cannot include participantGroupMemberId in splits',
        });
      }
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      const expense = await manager.getRepository(Expense).save(
        manager.getRepository(Expense).create({
          title: dto.title,
          description: dto.description,
          amountTotal: dto.amountTotal,
          currency: dto.currency.toUpperCase(),
          category: dto.category,
          paidByUser,
          ownerUser,
          group,
          expenseDate: dto.expenseDate,
          status: dto.status || 'posted',
        }),
      );

      await this.persistSplits(expense, dto, manager);

      if (dto.attachmentKeys?.length) {
        for (const key of dto.attachmentKeys) {
          await manager.getRepository(Attachment).save(
            manager.getRepository(Attachment).create({
              uploaderUser: ownerUser,
              expense,
              storageKey: key,
              originalName: this.basename(key),
              mimeType: 'application/octet-stream',
              sizeBytes: '0',
            }),
          );
        }
      }

      return await manager.getRepository(Expense).findOne({
        where: { id: expense.id },
        relations: ['paidByUser', 'ownerUser', 'group'],
      });
    });

    if (!saved) {
      throw new NotFoundException('Expense not found after creation');
    }

    return this.mapExpenseResponse(saved);
  }

  async listExpenses(userId: string, params: ExpenseListParams): Promise<PaginatedResponse<any>> {
    if (!this.isValidDateFormat(params.startDate) || !this.isValidDateFormat(params.endDate)) {
      throw new BadRequestException({
        errorCode: 'VAL_INVALID_INPUT',
        message: 'Date filters must use YYYY-MM-DD format',
      });
    }

    const page = Number.isFinite(params.page) && params.page > 0 ? params.page : 1;
    const limit = Number.isFinite(params.limit) && params.limit > 0 ? params.limit : 20;

    const membershipGroupIds = (await this.groupMemberRepository.find({
      where: { user: { id: userId }, joinStatus: In(['active', 'invited']) },
      relations: ['group'],
    })).map((m) => m.group.id);

    if (params.groupId) {
      const allowed = membershipGroupIds.includes(params.groupId);
      if (!allowed) {
        throw new ForbiddenException('You do not have access to this group');
      }
    }

    const query = this.expenseRepository
      .createQueryBuilder('expense')
      .leftJoinAndSelect('expense.paidByUser', 'paidByUser')
      .leftJoinAndSelect('expense.ownerUser', 'ownerUser')
      .leftJoinAndSelect('expense.group', 'group')
      .where(
        new Brackets((qb) => {
          qb.where('(expense.ownerUserId = :userId AND expense.groupId IS NULL)', { userId });
          if (membershipGroupIds.length > 0) {
            qb.orWhere('expense.groupId IN (:...groupIds)', { groupIds: membershipGroupIds });
          }
        }),
      );

    if (params.groupId) {
      query.andWhere('expense.groupId = :groupId', { groupId: params.groupId });
    }

    if (params.category) {
      query.andWhere('expense.category = :category', { category: params.category });
    }

    if (params.status) {
      query.andWhere('expense.status = :status', { status: params.status });
    }

    if (params.startDate) {
      query.andWhere('expense.expenseDate >= :startDate', { startDate: params.startDate });
    }

    if (params.endDate) {
      query.andWhere('expense.expenseDate <= :endDate', { endDate: params.endDate });
    }

    if (params.cursor) {
      query.andWhere('expense.id < :cursor', { cursor: params.cursor });
    }

    query.orderBy('expense.expenseDate', 'DESC').addOrderBy('expense.createdAt', 'DESC');

    const total = await query.getCount();
    const expenses = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    const mapped = await Promise.all(expenses.map((expense) => this.mapExpenseResponse(expense)));

    return paginate(mapped, total, page, limit, '/api/v1/expenses', {
      groupId: params.groupId,
      category: params.category,
      status: params.status,
      startDate: params.startDate,
      endDate: params.endDate,
      cursor: params.cursor,
    });
  }

  async getExpenseById(userId: string, id: string): Promise<any> {
    const expense = await this.expenseRepository.findOne({
      where: { id },
      relations: ['paidByUser', 'ownerUser', 'group'],
    });

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    await this.ensureExpenseAccess(userId, expense, false);
    return this.mapExpenseResponse(expense);
  }

  async updateExpense(userId: string, id: string, dto: UpdateExpenseDto): Promise<any> {
    const expense = await this.expenseRepository.findOne({
      where: { id },
      relations: ['paidByUser', 'ownerUser', 'group'],
    });

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    await this.ensureExpenseAccess(userId, expense, true);

    if (expense.version !== dto.version) {
      throw new PreconditionFailedException({
        errorCode: 'CON_VERSION_CONFLICT',
        message: 'Version conflict: the resource has been modified by another request',
      });
    }

    if ((dto.amountTotal !== undefined || dto.currency !== undefined) && dto.splits === undefined) {
      throw new BadRequestException({
        errorCode: 'VAL_INVALID_INPUT',
        message: 'Updating amountTotal or currency requires providing updated splits',
      });
    }

    if (dto.paidByUserId) {
      const paidByUser = await this.userRepository.findOne({ where: { id: dto.paidByUserId } });
      if (!paidByUser) {
        throw new BadRequestException({
          errorCode: 'VAL_INVALID_INPUT',
          message: 'paidByUserId must reference an existing user',
        });
      }
      if (!expense.group && dto.paidByUserId !== userId) {
        throw new ForbiddenException('Personal expenses must be paid by the authenticated user');
      }
      if (expense.group) {
        const payerMember = await this.groupMemberRepository.findOne({
          where: { group: { id: expense.group.id }, user: { id: dto.paidByUserId }, joinStatus: In(['active', 'invited']) },
        });
        if (!payerMember) {
          throw new BadRequestException({
            errorCode: 'VAL_INVALID_INPUT',
            message: 'paidByUserId must belong to the selected group',
          });
        }
      }
      expense.paidByUser = paidByUser;
    }

    if (dto.title !== undefined) expense.title = dto.title;
    if (dto.description !== undefined) expense.description = dto.description;
    if (dto.amountTotal !== undefined) expense.amountTotal = dto.amountTotal;
    if (dto.currency !== undefined) expense.currency = dto.currency.toUpperCase();
    if (dto.category !== undefined) expense.category = dto.category;
    if (dto.expenseDate !== undefined) expense.expenseDate = dto.expenseDate;
    if (dto.status !== undefined) expense.status = dto.status;

    const saved = await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(Expense).save(expense);

      if (dto.splits) {
        if (!expense.group && dto.splits.some((split) => !!split.participantGroupMemberId)) {
          throw new BadRequestException({
            errorCode: 'VAL_INVALID_INPUT',
            message: 'Personal expenses cannot include participantGroupMemberId in splits',
          });
        }

        await manager.getRepository(ExpenseSplit).delete({ expense: { id: expense.id } as any });
        await this.persistSplits(expense, {
          splits: dto.splits,
          amountTotal: dto.amountTotal ?? Number(expense.amountTotal),
          paidByUserId: dto.paidByUserId ?? expense.paidByUser.id,
          groupId: expense.group?.id,
        }, manager);
      }

      if (dto.attachmentKeys) {
        await manager.getRepository(Attachment).delete({ expense: { id: expense.id } as any });
        for (const key of dto.attachmentKeys) {
          await manager.getRepository(Attachment).save(
            manager.getRepository(Attachment).create({
              uploaderUser: expense.ownerUser,
              expense,
              storageKey: key,
              originalName: this.basename(key),
              mimeType: 'application/octet-stream',
              sizeBytes: '0',
            }),
          );
        }
      }

      return await manager.getRepository(Expense).findOne({
        where: { id: expense.id },
        relations: ['paidByUser', 'ownerUser', 'group'],
      });
    });

    if (!saved) {
      throw new NotFoundException('Expense not found after update');
    }

    return this.mapExpenseResponse(saved);
  }

  async deleteExpense(userId: string, id: string): Promise<void> {
    const expense = await this.expenseRepository.findOne({
      where: { id },
      relations: ['paidByUser', 'ownerUser', 'group'],
    });

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    await this.ensureExpenseAccess(userId, expense, true);

    if (expense.status === 'draft') {
      await this.expenseRepository.delete({ id: expense.id });
      return;
    }

    expense.status = 'void';
    await this.expenseRepository.save(expense);
  }
}
