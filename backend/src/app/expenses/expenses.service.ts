import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  Attachment,
  AuditLog,
  EncryptedExpenseKey,
  Expense,
  ExpenseSplit,
  Group,
  GroupMember,
  GroupMemberContribution,
  User,
} from '@finmate/data-models';
import { Brackets, DataSource, EntityManager, In, Repository } from 'typeorm';
import { paginate, PaginatedResponse } from '../common/pagination.util';
import { calculateDeterministicSplits } from './split-calculator.util';
import { CreateExpenseDto, UpdateExpenseDto } from './dto';

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface AnalyticsFilter {
  userId: string;
  groupId?: string;
  startDate?: string;
  endDate?: string;
}

interface MonthlyTotal {
  month: string;
  total: number;
  currency: string;
}

interface CategoryTotal {
  category: string;
  total: number;
  currency: string;
}

type ExpenseEncryptionMetadataInput = {
  groupId?: string;
  splits?: CreateExpenseDto['splits'] | UpdateExpenseDto['splits'];
  encryptionScope?: 'personal' | 'group' | 'direct_shared';
  wrappedContentKeys?: CreateExpenseDto['wrappedContentKeys'];
  encryptedAttachments?: CreateExpenseDto['encryptedAttachments'];
};

// ─── Service ──────────────────────────────────────────────────────────────────

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
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    @InjectRepository(EncryptedExpenseKey)
    private readonly encryptedExpenseKeyRepository: Repository<EncryptedExpenseKey>,
  ) {}

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private basename(value: string): string {
    if (!value) return '';
    const parts = value.split('/').filter(Boolean);
    return parts[parts.length - 1] || value;
  }

  private isValidDateFormat(value?: string): boolean {
    if (!value) return true;
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  /** Returns the YYYY-MM string for the given date string or today. */
  private toYearMonth(dateStr?: string): string {
    const d = dateStr ? new Date(dateStr) : new Date();
    if (isNaN(d.getTime())) {
      const today = new Date();
      return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  private async getGroupMembership(
    userId: string,
    groupId: string,
  ): Promise<GroupMember | null> {
    return this.groupMemberRepository.findOne({
      where: {
        group: { id: groupId },
        user: { id: userId },
        joinStatus: In(['active', 'invited']),
      },
      relations: ['user', 'group'],
    });
  }

  private async buildGroupParticipantMaps(
    groupId: string,
    manager: EntityManager,
  ): Promise<{
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
      // Spectators are stored in the map so we can look them up, but they are
      // validated against and rejected in persistSplits.
      activeOrInvitedByUserId.set(member.user.id, member);
    }

    return { groupMemberById, activeOrInvitedByUserId };
  }

  private async ensureExpenseAccess(
    userId: string,
    expense: Expense,
    write = false,
  ): Promise<void> {
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
      // viewers cannot write
      if (membership.role === 'viewer') {
        throw new ForbiddenException('Viewers cannot modify expenses');
      }

      // Members/spectators can only modify their own expenses (either created or paid by them)
      if (membership.role === 'member' || membership.role === 'spectator') {
        if (
          expense.ownerUser.id !== userId &&
          expense.paidByUser.id !== userId
        ) {
          throw new ForbiddenException(
            'Members can only modify their own expenses',
          );
        }
      }

      const group = await this.groupRepository.findOne({
        where: { id: expense.group.id },
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

      // Household month-lock: previous month's expenses are immutable
      if (group.groupType === 'household' && expense.ledgerMonth) {
        const currentMonth = this.toYearMonth();
        if (expense.ledgerMonth < currentMonth) {
          throw new ForbiddenException({
            errorCode: 'EXP_MONTH_LOCKED',
            message: `Household expenses from ${expense.ledgerMonth} are locked and cannot be modified`,
          });
        }
      }
    }
  }

  /** Write an audit log entry. Fire-and-forget — never throws. */
  private async writeAuditLog(opts: {
    actorUser: User;
    action: string;
    entityId: string;
    groupId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.auditLogRepository.save(
        this.auditLogRepository.create({
          actorUser: opts.actorUser,
          action: opts.action,
          entityType: 'expense',
          entityId: opts.entityId,
          scope: opts.groupId ? 'group' : 'personal',
          group: opts.groupId ? ({ id: opts.groupId } as Group) : undefined,
          metadataJson: opts.metadata,
        }),
      );
    } catch {
      // Audit failures must never block the primary operation
    }
  }

  /** Retrieves wrapped content keys for a direct_shared expense. */
  private async getWrappedContentKeys(
    expenseId: string,
  ): Promise<Array<{ userId: string; wrappedKey: string }>> {
    const keys = await this.encryptedExpenseKeyRepository.find({
      where: { expense: { id: expenseId } },
      relations: ['user'],
    });
    return keys.map((k) => ({
      userId: k.user.id,
      wrappedKey: k.wrappedKey,
    }));
  }

  private getDirectParticipantIds(
    dto: ExpenseEncryptionMetadataInput,
    ownerUserId: string,
  ): string[] {
    const ids = new Set<string>([ownerUserId]);
    for (const split of dto.splits ?? []) {
      if (split.participantUserId) {
        ids.add(split.participantUserId);
      }
    }
    return [...ids];
  }

  private validateAttachmentEnvelopeMetadata(
    dto: ExpenseEncryptionMetadataInput,
  ): void {
    for (const attachment of dto.encryptedAttachments ?? []) {
      if (
        !attachment.storageKey ||
        !attachment.encryptedFileKey ||
        !attachment.encryptedOriginalName ||
        !attachment.mimeType ||
        !Number.isFinite(Number(attachment.sizeBytes)) ||
        Number(attachment.sizeBytes) < 0
      ) {
        throw new BadRequestException({
          errorCode: 'VAL_INVALID_INPUT',
          message: 'Encrypted attachment metadata is incomplete',
        });
      }
    }
  }

  private validateExpenseEncryptionMetadata(
    userId: string,
    dto: ExpenseEncryptionMetadataInput,
    groupId?: string,
  ): void {
    this.validateAttachmentEnvelopeMetadata(dto);

    const scope =
      dto.encryptionScope ??
      (groupId
        ? 'group'
        : this.getDirectParticipantIds(dto, userId).length > 1
          ? 'direct_shared'
          : 'personal');

    if (groupId && scope !== 'group') {
      throw new BadRequestException({
        errorCode: 'EXP_ENCRYPTION_SCOPE_MISMATCH',
        message: 'Group expenses must use group encryption scope',
      });
    }

    if (!groupId && scope === 'group') {
      throw new BadRequestException({
        errorCode: 'EXP_ENCRYPTION_SCOPE_MISMATCH',
        message: 'Personal expenses cannot use group encryption scope',
      });
    }

    if (scope === 'direct_shared') {
      const participantIds = this.getDirectParticipantIds(dto, userId);
      if (participantIds.length < 2) {
        throw new BadRequestException({
          errorCode: 'EXP_ENCRYPTION_SCOPE_MISMATCH',
          message: 'Direct-shared encryption requires at least two participants',
        });
      }

      const wrappedUserIds = new Set(
        (dto.wrappedContentKeys ?? []).map((key) => key.userId),
      );
      const missingKeyFor = participantIds.find((id) => !wrappedUserIds.has(id));
      if (missingKeyFor) {
        throw new BadRequestException({
          errorCode: 'EXP_MISSING_WRAPPED_KEY',
          message: 'Direct-shared expenses require wrapped keys for all participants',
        });
      }
    }

    if (scope === 'personal' && this.getDirectParticipantIds(dto, userId).length > 1) {
      throw new BadRequestException({
        errorCode: 'EXP_ENCRYPTION_SCOPE_MISMATCH',
        message: 'Shared personal expenses must use direct-shared encryption scope',
      });
    }
  }

  private async mapExpenseResponse(
    expense: Expense,
  ): Promise<Record<string, unknown>> {
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
      encryptionScope: expense.encryptionScope ?? 'personal',
      ledgerMonth: expense.ledgerMonth ?? null,
      isCarryForward: expense.isCarryForward,
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
        encryptedFileKey: attachment.encryptedFileKey ?? null,
        encryptedOriginalName: attachment.encryptedOriginalName ?? null,
        createdAt: attachment.createdAt,
      })),
      wrappedContentKeys: await this.getWrappedContentKeys(expense.id),
      version: expense.version,
      createdAt: expense.createdAt,
      updatedAt: expense.updatedAt,
      deletedAt: expense.deletedAt ?? null,
    };
  }

  private async persistSplits(
    expense: Expense,
    dto: Pick<
      CreateExpenseDto,
      'splits' | 'amountTotal' | 'paidByUserId' | 'groupId'
    >,
    manager: EntityManager,
  ): Promise<void> {
    const payerKey = dto.groupId
      ? (
          await manager.getRepository(GroupMember).findOne({
            where: {
              group: { id: dto.groupId },
              user: { id: dto.paidByUserId },
              joinStatus: In(['active', 'invited']),
            },
          })
        )?.id
      : dto.paidByUserId;

    const calculated = calculateDeterministicSplits(
      dto.amountTotal,
      dto.splits,
      payerKey,
    );

    if (!dto.groupId) {
      const participantIds = [
        ...new Set(dto.splits.map((split) => split.participantUserId || '')),
      ].filter(Boolean);
      const users = await manager
        .getRepository(User)
        .find({ where: { id: In(participantIds) } });
      const userMap = new Map(users.map((u) => [u.id, u]));

      for (const split of calculated) {
        const participantUser = split.participantUserId
          ? userMap.get(split.participantUserId)
          : undefined;
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

    const { groupMemberById, activeOrInvitedByUserId } =
      await this.buildGroupParticipantMaps(dto.groupId, manager);

    for (const split of calculated) {
      // Resolve the participant
      const participantGroupMember = split.participantGroupMemberId
        ? groupMemberById.get(split.participantGroupMemberId)
        : undefined;
      const participantByUser = split.participantUserId
        ? activeOrInvitedByUserId.get(split.participantUserId)
        : undefined;

      const resolvedMember = participantGroupMember || participantByUser;

      if (!resolvedMember) {
        throw new BadRequestException({
          errorCode: 'VAL_INVALID_INPUT',
          message: 'Each split participant must belong to the selected group',
        });
      }

      // Spectators are NEVER part of split calculations
      if (resolvedMember.role === 'spectator') {
        throw new BadRequestException({
          errorCode: 'EXP_SPECTATOR_SPLIT',
          message: `Spectator members (${resolvedMember.user?.id ?? resolvedMember.id}) cannot be included in expense splits`,
        });
      }

      await manager.getRepository(ExpenseSplit).save(
        manager.getRepository(ExpenseSplit).create({
          expense,
          participantGroupMember: resolvedMember,
          splitType: split.splitType,
          shareValue: split.shareValue,
          amountOwed: split.amountOwed,
          isSettled: false,
        }),
      );
    }
  }

  // ─── CRUD Operations ───────────────────────────────────────────────────────

  /** Create a personal or group expense. */
  async createExpense(
    userId: string,
    dto: CreateExpenseDto,
  ): Promise<Record<string, unknown>> {
    if (!dto.splits || !Array.isArray(dto.splits) || dto.splits.length === 0) {
      throw new BadRequestException({
        errorCode: 'VAL_INVALID_INPUT',
        message: 'Splits must be a non-empty array',
      });
    }

    const ownerUser = await this.userRepository.findOne({
      where: { id: userId },
    });
    if (!ownerUser) {
      throw new NotFoundException('User not found');
    }

    const paidByUser = await this.userRepository.findOne({
      where: { id: dto.paidByUserId },
    });
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
      // Viewers cannot create; spectators can create (but are excluded from splits)
      if (membership.role === 'viewer') {
        throw new ForbiddenException('Viewers cannot create expenses');
      }

      group = await this.groupRepository.findOne({
        where: { id: dto.groupId },
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

      // ── Currency validation ─────────────────────────────────────────────
      if (
        group.currency &&
        dto.currency.toUpperCase() !== group.currency.toUpperCase()
      ) {
        throw new BadRequestException({
          errorCode: 'EXP_CURRENCY_MISMATCH',
          message: `Expense currency must match the group's base currency (${group.currency})`,
        });
      }

      const payerInGroup = await this.groupMemberRepository.findOne({
        where: {
          group: { id: dto.groupId },
          user: { id: dto.paidByUserId },
          joinStatus: In(['active', 'invited']),
        },
      });
      if (!payerInGroup) {
        throw new BadRequestException({
          errorCode: 'VAL_INVALID_INPUT',
          message: 'paidByUserId must belong to the selected group',
        });
      }
    } else {
      if (dto.paidByUserId !== userId) {
        throw new ForbiddenException(
          'Personal expenses must be paid by the authenticated user',
        );
      }
      const hasGroupMemberParticipant = dto.splits.some(
        (split) => !!split.participantGroupMemberId,
      );
      if (hasGroupMemberParticipant) {
        throw new BadRequestException({
          errorCode: 'VAL_INVALID_INPUT',
          message:
            'Personal expenses cannot include participantGroupMemberId in splits',
        });
      }
    }

    this.validateExpenseEncryptionMetadata(userId, dto, group?.id);
    const effectiveEncryptionScope =
      dto.encryptionScope ?? (group ? 'group' : 'personal');

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
          encryptionScope: effectiveEncryptionScope,
          // Auto-assign ledgerMonth for household groups
          ledgerMonth:
            group?.groupType === 'household'
              ? dto.expenseDate.slice(0, 7)
              : undefined,
          isCarryForward: false,
        }),
      );

      await this.persistSplits(expense, dto, manager);

      // Save wrapped content keys for direct_shared expenses
      if (
        effectiveEncryptionScope === 'direct_shared' &&
        dto.wrappedContentKeys?.length
      ) {
        for (const wk of dto.wrappedContentKeys) {
          await manager.getRepository(EncryptedExpenseKey).save(
            manager.getRepository(EncryptedExpenseKey).create({
              expense,
              user: { id: wk.userId } as User,
              wrappedKey: wk.wrappedKey,
            }),
          );
        }
      }

      // Save encrypted attachments (new model)
      if (dto.encryptedAttachments?.length) {
        for (const att of dto.encryptedAttachments) {
          await manager.getRepository(Attachment).save(
            manager.getRepository(Attachment).create({
              uploaderUser: ownerUser,
              expense,
              storageKey: att.storageKey,
              originalName: 'encrypted',
              mimeType: att.mimeType,
              sizeBytes: String(att.sizeBytes),
              encryptedFileKey: att.encryptedFileKey,
              encryptedOriginalName: att.encryptedOriginalName,
            }),
          );
        }
      } else if (dto.attachmentKeys?.length) {
        // Legacy attachment keys support
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

      return manager.getRepository(Expense).findOne({
        where: { id: expense.id },
        relations: ['paidByUser', 'ownerUser', 'group'],
      });
    });

    if (!saved) {
      throw new NotFoundException('Expense not found after creation');
    }

    // Write audit log (non-blocking)
    void this.writeAuditLog({
      actorUser: ownerUser,
      action: 'expense.created',
      entityId: saved.id,
      groupId: group?.id,
      metadata: {
        title: saved.title,
        amountTotal: Number(saved.amountTotal),
        currency: saved.currency,
      },
    });

    return this.mapExpenseResponse(saved);
  }

  /** List expenses with pagination and filtering. */
  async listExpenses(
    userId: string,
    params: ExpenseListParams,
  ): Promise<PaginatedResponse<Record<string, unknown>>> {
    if (
      !this.isValidDateFormat(params.startDate) ||
      !this.isValidDateFormat(params.endDate)
    ) {
      throw new BadRequestException({
        errorCode: 'VAL_INVALID_INPUT',
        message: 'Date filters must use YYYY-MM-DD format',
      });
    }

    const page =
      Number.isFinite(params.page) && params.page > 0 ? params.page : 1;
    const limit =
      Number.isFinite(params.limit) && params.limit > 0 ? params.limit : 20;

    const membershipGroupIds = (
      await this.groupMemberRepository.find({
        where: { user: { id: userId }, joinStatus: In(['active', 'invited']) },
        relations: ['group'],
      })
    ).map((m) => m.group.id);

    if (params.groupId && params.groupId !== 'personal') {
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
          qb.where('(ownerUser.id = :userId AND group.id IS NULL)', { userId });
          if (membershipGroupIds.length > 0) {
            qb.orWhere('group.id IN (:...groupIds)', {
              groupIds: membershipGroupIds,
            });
          }
        }),
      );

    if (params.groupId) {
      if (params.groupId === 'personal') {
        query.andWhere('group.id IS NULL');
      } else {
        query.andWhere('group.id = :groupId', { groupId: params.groupId });
      }
    }

    if (params.category) {
      query.andWhere('expense.category = :category', {
        category: params.category,
      });
    }

    if (params.status) {
      query.andWhere('expense.status = :status', { status: params.status });
    }

    if (params.startDate) {
      query.andWhere('expense.expenseDate >= :startDate', {
        startDate: params.startDate,
      });
    }

    if (params.endDate) {
      query.andWhere('expense.expenseDate <= :endDate', {
        endDate: params.endDate,
      });
    }

    if (params.cursor) {
      query.andWhere('expense.id < :cursor', { cursor: params.cursor });
    }

    query
      .orderBy('expense.expenseDate', 'DESC')
      .addOrderBy('expense.createdAt', 'DESC');

    const total = await query.getCount();
    const expenses = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    const mapped = await Promise.all(
      expenses.map((expense) => this.mapExpenseResponse(expense)),
    );

    return paginate(mapped, total, page, limit, '/api/v1/expenses', {
      groupId: params.groupId,
      category: params.category,
      status: params.status,
      startDate: params.startDate,
      endDate: params.endDate,
      cursor: params.cursor,
    });
  }

  /** Get a single expense by ID. */
  async getExpenseById(
    userId: string,
    id: string,
  ): Promise<Record<string, unknown>> {
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

  /** Update an expense's fields and/or splits. */
  async updateExpense(
    userId: string,
    id: string,
    dto: UpdateExpenseDto,
  ): Promise<Record<string, unknown>> {
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
        message:
          'Version conflict: the resource has been modified by another request',
      });
    }

    if (
      (dto.amountTotal !== undefined || dto.currency !== undefined) &&
      dto.splits === undefined
    ) {
      throw new BadRequestException({
        errorCode: 'VAL_INVALID_INPUT',
        message:
          'Updating amountTotal or currency requires providing updated splits',
      });
    }

    // Currency validation (group expenses)
    if (dto.currency !== undefined && expense.group) {
      const grp = await this.groupRepository.findOne({
        where: { id: expense.group.id },
      });
      if (
        grp &&
        grp.currency &&
        dto.currency.toUpperCase() !== grp.currency.toUpperCase()
      ) {
        throw new BadRequestException({
          errorCode: 'EXP_CURRENCY_MISMATCH',
          message: `Expense currency must match the group's base currency (${grp.currency})`,
        });
      }
    }

    if (dto.paidByUserId) {
      const paidByUser = await this.userRepository.findOne({
        where: { id: dto.paidByUserId },
      });
      if (!paidByUser) {
        throw new BadRequestException({
          errorCode: 'VAL_INVALID_INPUT',
          message: 'paidByUserId must reference an existing user',
        });
      }
      if (!expense.group && dto.paidByUserId !== userId) {
        throw new ForbiddenException(
          'Personal expenses must be paid by the authenticated user',
        );
      }
      if (expense.group) {
        const payerMember = await this.groupMemberRepository.findOne({
          where: {
            group: { id: expense.group.id },
            user: { id: dto.paidByUserId },
            joinStatus: In(['active', 'invited']),
          },
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

    const previousTitle = expense.title;
    if (dto.title !== undefined) expense.title = dto.title;
    if (dto.description !== undefined) expense.description = dto.description;
    if (dto.amountTotal !== undefined) expense.amountTotal = dto.amountTotal;
    if (dto.currency !== undefined)
      expense.currency = dto.currency.toUpperCase();
    if (dto.category !== undefined) expense.category = dto.category;
    if (dto.expenseDate !== undefined) expense.expenseDate = dto.expenseDate;
    if (dto.status !== undefined) expense.status = dto.status;
    if (dto.encryptionScope !== undefined)
      expense.encryptionScope = dto.encryptionScope;

    const actorUser = await this.userRepository.findOne({
      where: { id: userId },
    });

    const validationSplits =
      dto.splits ??
      (
        await this.expenseSplitRepository.find({
          where: { expense: { id: expense.id } },
          relations: ['participantUser'],
        })
      ).map((split) => ({
        participantUserId: split.participantUser?.id,
        splitType: split.splitType,
        shareValue: Number(split.shareValue),
      }));

    this.validateExpenseEncryptionMetadata(
      userId,
      {
        ...dto,
        splits: validationSplits,
      },
      expense.group?.id,
    );

    const saved = await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(Expense).save(expense);

      if (dto.splits) {
        if (
          !expense.group &&
          dto.splits.some((split) => !!split.participantGroupMemberId)
        ) {
          throw new BadRequestException({
            errorCode: 'VAL_INVALID_INPUT',
            message:
              'Personal expenses cannot include participantGroupMemberId in splits',
          });
        }

        await manager
          .getRepository(ExpenseSplit)
          .delete({ expense: { id: expense.id } as Partial<Expense> });
        await this.persistSplits(
          expense,
          {
            splits: dto.splits,
            amountTotal: dto.amountTotal ?? Number(expense.amountTotal),
            paidByUserId: dto.paidByUserId ?? expense.paidByUser.id,
            groupId: expense.group?.id,
          },
          manager,
        );
      }

      if (expense.encryptionScope === 'direct_shared' && dto.wrappedContentKeys) {
        await manager
          .getRepository(EncryptedExpenseKey)
          .delete({ expense: { id: expense.id } as Partial<Expense> });
        for (const wk of dto.wrappedContentKeys) {
          await manager.getRepository(EncryptedExpenseKey).save(
            manager.getRepository(EncryptedExpenseKey).create({
              expense,
              user: { id: wk.userId } as User,
              wrappedKey: wk.wrappedKey,
            }),
          );
        }
      }

      if (dto.encryptedAttachments) {
        await manager
          .getRepository(Attachment)
          .delete({ expense: { id: expense.id } as Partial<Expense> });
        for (const att of dto.encryptedAttachments) {
          await manager.getRepository(Attachment).save(
            manager.getRepository(Attachment).create({
              uploaderUser: expense.ownerUser,
              expense,
              storageKey: att.storageKey,
              originalName: 'encrypted',
              mimeType: att.mimeType,
              sizeBytes: String(att.sizeBytes),
              encryptedFileKey: att.encryptedFileKey,
              encryptedOriginalName: att.encryptedOriginalName,
            }),
          );
        }
      } else if (dto.attachmentKeys) {
        await manager
          .getRepository(Attachment)
          .delete({ expense: { id: expense.id } as Partial<Expense> });
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

      return manager.getRepository(Expense).findOne({
        where: { id: expense.id },
        relations: ['paidByUser', 'ownerUser', 'group'],
      });
    });

    if (!saved) {
      throw new NotFoundException('Expense not found after update');
    }

    // Write audit log (non-blocking)
    if (actorUser) {
      void this.writeAuditLog({
        actorUser,
        action: 'expense.updated',
        entityId: saved.id,
        groupId: expense.group?.id,
        metadata: {
          previousTitle,
          newTitle: saved.title,
          amountTotal: Number(saved.amountTotal),
        },
      });
    }

    return this.mapExpenseResponse(saved);
  }

  /**
   * Soft-delete an expense.
   * - Draft expenses are hard-deleted.
   * - Posted expenses are soft-deleted (deleted_at set, status → void).
   */
  async deleteExpense(userId: string, id: string): Promise<void> {
    const expense = await this.expenseRepository.findOne({
      where: { id },
      relations: ['paidByUser', 'ownerUser', 'group'],
    });

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    await this.ensureExpenseAccess(userId, expense, true);

    const actorUser = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (expense.status === 'draft') {
      await this.expenseRepository.delete({ id: expense.id });
      return;
    }

    // Soft-delete: mark deleted_at + void status
    expense.status = 'void';
    await this.expenseRepository.softRemove(expense);

    // Write audit log (non-blocking)
    if (actorUser) {
      void this.writeAuditLog({
        actorUser,
        action: 'expense.deleted',
        entityId: expense.id,
        groupId: expense.group?.id,
        metadata: {
          title: expense.title,
          amountTotal: Number(expense.amountTotal),
          currency: expense.currency,
        },
      });
    }
  }

  /**
   * Restore a soft-deleted expense.
   *
   * Restore window: the expense must have been deleted within the current
   * calendar month OR within the first 7 days of the following month.
   */
  async restoreExpense(
    userId: string,
    id: string,
  ): Promise<Record<string, unknown>> {
    // withDeleted: true so we can find soft-deleted records
    const expense = await this.expenseRepository.findOne({
      where: { id },
      relations: ['paidByUser', 'ownerUser', 'group'],
      withDeleted: true,
    });

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    if (!expense.deletedAt) {
      throw new BadRequestException({
        errorCode: 'VAL_INVALID_INPUT',
        message:
          'This expense has not been deleted and does not need restoring',
      });
    }

    // Verify the caller has write access to the group (or owns the personal expense)
    await this.ensureRestoreAccess(userId, expense);

    // ── Restore window check ─────────────────────────────────────────────────
    const now = new Date();
    const deletedAt = expense.deletedAt;
    const deletedMonth = new Date(
      deletedAt.getFullYear(),
      deletedAt.getMonth(),
      1,
    );
    // Grace period = last day of deletion month + 7 days
    const graceEnd = new Date(
      deletedAt.getFullYear(),
      deletedAt.getMonth() + 1,
      7,
      23,
      59,
      59,
    );

    if (now > graceEnd) {
      throw new ForbiddenException({
        errorCode: 'EXP_RESTORE_WINDOW',
        message: `Restore window has expired. Expenses can only be restored within the month of deletion plus 7 days (deadline was ${graceEnd.toISOString().slice(0, 10)})`,
      });
    }

    // Suppress unused variable warning
    void deletedMonth;

    const actorUser = await this.userRepository.findOne({
      where: { id: userId },
    });

    // Restore: clear deleted_at and reset status to posted
    await this.expenseRepository.restore({ id: expense.id });
    expense.status = 'posted';
    expense.deletedAt = undefined;
    await this.expenseRepository.save(expense);

    const restored = await this.expenseRepository.findOne({
      where: { id: expense.id },
      relations: ['paidByUser', 'ownerUser', 'group'],
    });

    if (!restored) {
      throw new NotFoundException('Expense not found after restore');
    }

    // Write audit log (non-blocking)
    if (actorUser) {
      void this.writeAuditLog({
        actorUser,
        action: 'expense.restored',
        entityId: restored.id,
        groupId: expense.group?.id,
        metadata: { title: restored.title },
      });
    }

    return this.mapExpenseResponse(restored);
  }

  /** Check that the user can restore this expense (access check without write-lock enforcement). */
  private async ensureRestoreAccess(
    userId: string,
    expense: Expense,
  ): Promise<void> {
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
    if (membership.role === 'viewer') {
      throw new ForbiddenException('Viewers cannot restore expenses');
    }
    // Members can only restore their own; admins/owners can restore any
    if (membership.role === 'member' || membership.role === 'spectator') {
      if (expense.ownerUser.id !== userId) {
        throw new ForbiddenException(
          'Members can only restore their own expenses',
        );
      }
    }
  }

  // ─── Analytics ─────────────────────────────────────────────────────────────

  /**
   * Monthly expense summary: totals per month for a given year.
   * Only `posted` expenses are included.
   */
  async getMonthlySummary(
    filter: AnalyticsFilter & { year: number },
  ): Promise<MonthlyTotal[]> {
    const { userId, groupId, year } = filter;

    await this.assertGroupAccess(userId, groupId);

    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const expenses = await this.buildBaseAnalyticsQuery(
      userId,
      groupId,
      startDate,
      endDate,
    )
      .select([
        'expense.id',
        'expense.expenseDate',
        'expense.amountTotal',
        'expense.currency',
      ])
      .getMany();

    const groups = new Map<string, { total: number; currency: string }>();
    for (const exp of expenses) {
      const month = exp.expenseDate.slice(0, 7); // YYYY-MM
      const key = `${month}_${exp.currency}`;
      const existing = groups.get(key) || { total: 0, currency: exp.currency };
      existing.total += Number(exp.amountTotal);
      groups.set(key, existing);
    }

    const results: MonthlyTotal[] = [];
    for (const [key, val] of groups.entries()) {
      const month = key.split('_')[0];
      results.push({
        month,
        total: Math.round(val.total * 100) / 100,
        currency: val.currency,
      });
    }

    return results.sort((a, b) => a.month.localeCompare(b.month));
  }

  /**
   * Yearly expense summary: totals per year across all years.
   * Only `posted` expenses are included.
   */
  async getYearlySummary(filter: AnalyticsFilter): Promise<MonthlyTotal[]> {
    const { userId, groupId } = filter;

    await this.assertGroupAccess(userId, groupId);

    const expenses = await this.buildBaseAnalyticsQuery(userId, groupId)
      .select([
        'expense.id',
        'expense.expenseDate',
        'expense.amountTotal',
        'expense.currency',
      ])
      .getMany();

    const groups = new Map<string, { total: number; currency: string }>();
    for (const exp of expenses) {
      const year = exp.expenseDate.slice(0, 4); // YYYY
      const key = `${year}_${exp.currency}`;
      const existing = groups.get(key) || { total: 0, currency: exp.currency };
      existing.total += Number(exp.amountTotal);
      groups.set(key, existing);
    }

    const results: MonthlyTotal[] = [];
    for (const [key, val] of groups.entries()) {
      const year = key.split('_')[0];
      results.push({
        month: year,
        total: Math.round(val.total * 100) / 100,
        currency: val.currency,
      });
    }

    return results.sort((a, b) => a.month.localeCompare(b.month));
  }

  /**
   * Category distribution: totals per category.
   * Only `posted` expenses are included.
   */
  async getCategoryDistribution(
    filter: AnalyticsFilter,
  ): Promise<CategoryTotal[]> {
    const { userId, groupId, startDate, endDate } = filter;

    await this.assertGroupAccess(userId, groupId);

    const expenses = await this.buildBaseAnalyticsQuery(
      userId,
      groupId,
      startDate,
      endDate,
    )
      .select([
        'expense.id',
        'expense.category',
        'expense.amountTotal',
        'expense.currency',
      ])
      .getMany();

    const groups = new Map<string, { total: number; currency: string }>();
    for (const exp of expenses) {
      const key = `${exp.category}_${exp.currency}`;
      const existing = groups.get(key) || { total: 0, currency: exp.currency };
      existing.total += Number(exp.amountTotal);
      groups.set(key, existing);
    }

    const results: CategoryTotal[] = [];
    for (const [key, val] of groups.entries()) {
      const category = key.split('_')[0];
      results.push({
        category,
        total: Math.round(val.total * 100) / 100,
        currency: val.currency,
      });
    }

    return results.sort((a, b) => b.total - a.total);
  }

  private buildBaseAnalyticsQuery(
    userId: string,
    groupId?: string,
    startDate?: string,
    endDate?: string,
  ) {
    const query = this.expenseRepository
      .createQueryBuilder('expense')
      .leftJoin('expense.ownerUser', 'ownerUser')
      .leftJoin('expense.group', 'group')
      .where('expense.status = :status', { status: 'posted' })
      .andWhere('expense.deleted_at IS NULL');

    if (groupId) {
      query.andWhere('group.id = :groupId', { groupId });
    } else {
      query.andWhere('ownerUser.id = :userId AND group.id IS NULL', { userId });
    }

    if (startDate) {
      query.andWhere('expense.expense_date >= :startDate', { startDate });
    }
    if (endDate) {
      query.andWhere('expense.expense_date <= :endDate', { endDate });
    }

    return query;
  }

  private async assertGroupAccess(
    userId: string,
    groupId?: string,
  ): Promise<void> {
    if (!groupId) return;
    const membership = await this.getGroupMembership(userId, groupId);
    if (!membership) {
      throw new ForbiddenException('You do not have access to this group');
    }
  }

  /**
   * Household carry-forward summary: net extra-paid balance per member for a given month.
   * Only applies to `household` group type.
   */
  async getCarryForwardSummary(
    userId: string,
    groupId: string,
    ledgerMonth: string,
  ): Promise<
    {
      userId: string;
      displayName: string | null;
      netBalance: number;
      currency: string;
      paid: number;
      expected: number;
      percentage: number;
    }[]
  > {
    await this.assertGroupAccess(userId, groupId);

    const group = await this.groupRepository.findOne({
      where: { id: groupId },
    });
    if (!group) throw new NotFoundException('Group not found');
    if (group.groupType !== 'household') {
      throw new BadRequestException({
        errorCode: 'VAL_INVALID_INPUT',
        message: 'Carry-forward summary is only available for household groups',
      });
    }

    // Get all posted expenses for the ledger month
    const expenses = await this.expenseRepository.find({
      where: { group: { id: groupId }, ledgerMonth, status: 'posted' },
      relations: ['paidByUser', 'ownerUser'],
      withDeleted: false,
    });

    const activeMembers = await this.groupMemberRepository.find({
      where: { group: { id: groupId }, joinStatus: 'active' },
      relations: ['user'],
    });

    const carryExpenses = expenses.filter((exp) => exp.isCarryForward);
    const normalExpenses = expenses.filter((exp) => !exp.isCarryForward);

    // Compute total monthly spending S from normal expenses only
    const S = normalExpenses.reduce(
      (sum, exp) => sum + Number(exp.amountTotal),
      0,
    );

    // Compute normal paid amounts per active user
    const paidMap = new Map<string, number>();
    for (const member of activeMembers) {
      paidMap.set(member.user.id, 0);
    }
    for (const exp of normalExpenses) {
      const uid = exp.paidByUser.id;
      paidMap.set(uid, (paidMap.get(uid) ?? 0) + Number(exp.amountTotal));
    }

    // Look up monthly contribution percentages
    const contributions = await this.dataSource
      .getRepository(GroupMemberContribution)
      .createQueryBuilder('contribution')
      .innerJoinAndSelect('contribution.groupMember', 'groupMember')
      .where('groupMember.group_id = :groupId', { groupId })
      .andWhere('contribution.ledgerMonth = :ledgerMonth', { ledgerMonth })
      .getMany();

    const contributionMap = new Map<string, number>();
    for (const c of contributions) {
      contributionMap.set(c.groupMember.id, Number(c.percentage));
    }

    const currency = group.currency;

    if (activeMembers.length === 0) {
      return [];
    }

    // Load splits for carry forward expenses to adjust targets
    const carryExpenseIds = carryExpenses.map((e) => e.id);
    const carrySplits = carryExpenseIds.length
      ? await this.expenseSplitRepository.find({
          where: { expense: { id: In(carryExpenseIds) } },
          relations: [
            'expense',
            'participantUser',
            'participantGroupMember',
            'participantGroupMember.user',
          ],
        })
      : [];

    const carryOwedMap = new Map<string, number>();
    const carryPaidMap = new Map<string, number>();

    for (const member of activeMembers) {
      carryOwedMap.set(member.user.id, 0);
      carryPaidMap.set(member.user.id, 0);
    }

    for (const exp of carryExpenses) {
      const payerId = exp.paidByUser.id;
      carryPaidMap.set(
        payerId,
        (carryPaidMap.get(payerId) ?? 0) + Number(exp.amountTotal),
      );
    }

    for (const split of carrySplits) {
      const participantId =
        split.participantUser?.id || split.participantGroupMember?.user?.id;
      if (participantId) {
        carryOwedMap.set(
          participantId,
          (carryOwedMap.get(participantId) ?? 0) + Number(split.amountOwed),
        );
      }
    }

    return activeMembers.map((m) => {
      const pct = contributionMap.get(m.id) ?? 100 / activeMembers.length;
      const TuNormal = S * (pct / 100);
      const PuNormal = paidMap.get(m.user.id) ?? 0;

      const carryPaid = carryPaidMap.get(m.user.id) ?? 0;
      const carryOwed = carryOwedMap.get(m.user.id) ?? 0;

      const Pu = PuNormal + carryPaid;
      const Tu = TuNormal + carryOwed;

      return {
        userId: m.user.id,
        displayName: m.user.displayName || m.user.email,
        netBalance: Math.round((Pu - Tu) * 100) / 100,
        currency,
        paid: Math.round(Pu * 100) / 100,
        expected: Math.round(Tu * 100) / 100,
        percentage: pct,
      };
    });
  }

  private simplifyDebts(
    balances: { userId: string; balance: number }[],
    currency: string,
  ): {
    fromUserId: string;
    toUserId: string;
    amount: number;
    currency: string;
  }[] {
    let activeBalances = balances
      .map((b) => ({
        userId: b.userId,
        balance: Number(b.balance),
      }))
      .filter((b) => Math.abs(b.balance) >= 0.01);

    const transactions: {
      fromUserId: string;
      toUserId: string;
      amount: number;
      currency: string;
    }[] = [];

    while (true) {
      const debtors = activeBalances
        .filter((b) => b.balance < 0)
        .sort((a, b) => {
          if (Math.abs(a.balance - b.balance) < 0.0001) {
            return a.userId.localeCompare(b.userId);
          }
          return a.balance - b.balance;
        });

      const creditors = activeBalances
        .filter((b) => b.balance > 0)
        .sort((a, b) => {
          if (Math.abs(a.balance - b.balance) < 0.0001) {
            return a.userId.localeCompare(b.userId);
          }
          return b.balance - a.balance;
        });

      if (debtors.length === 0 || creditors.length === 0) {
        break;
      }

      const debtor = debtors[0];
      const creditor = creditors[0];

      const debitAmount = Math.abs(debtor.balance);
      const creditAmount = creditor.balance;
      const transferAmount = Math.min(debitAmount, creditAmount);
      const roundedTransfer = Math.round(transferAmount * 100) / 100;

      if (roundedTransfer > 0) {
        transactions.push({
          fromUserId: debtor.userId,
          toUserId: creditor.userId,
          amount: roundedTransfer,
          currency: currency,
        });
      }

      debtor.balance += transferAmount;
      creditor.balance -= transferAmount;

      activeBalances = activeBalances
        .map((b) => {
          if (b.userId === debtor.userId)
            return { ...b, balance: debtor.balance };
          if (b.userId === creditor.userId)
            return { ...b, balance: creditor.balance };
          return b;
        })
        .filter((b) => Math.abs(b.balance) >= 0.01);
    }

    return transactions;
  }

  async closeMonth(
    userId: string,
    groupId: string,
    ledgerMonth: string,
  ): Promise<{ nextLedgerMonth: string; carryForwardExpenseCount: number }> {
    // 1. Verify access: caller must have active membership and role owner or admin
    const callerMember = await this.groupMemberRepository.findOne({
      where: {
        group: { id: groupId },
        user: { id: userId },
        joinStatus: 'active',
      },
      relations: ['user'],
    });
    if (
      !callerMember ||
      (callerMember.role !== 'owner' && callerMember.role !== 'admin')
    ) {
      throw new ForbiddenException(
        'Only owners and admins can close a billing month',
      );
    }

    const group = await this.groupRepository.findOne({
      where: { id: groupId },
    });
    if (!group) throw new NotFoundException('Group not found');
    if (group.groupType !== 'household') {
      throw new BadRequestException({
        errorCode: 'VAL_INVALID_INPUT',
        message: 'Month finalization is only available for household groups',
      });
    }

    const currentMonth = this.toYearMonth();
    if (ledgerMonth > currentMonth) {
      throw new BadRequestException({
        errorCode: 'VAL_INVALID_INPUT',
        message: 'Cannot close a future billing month',
      });
    }

    const [yearStr, monthStr] = ledgerMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const nextDate = new Date(year, month, 1);
    const nextLedgerMonth = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;

    // Verify duplicate closure
    const existingCarryForward = await this.expenseRepository.count({
      where: {
        group: { id: groupId },
        ledgerMonth: nextLedgerMonth,
        isCarryForward: true,
      },
    });
    if (existingCarryForward > 0) {
      throw new BadRequestException({
        errorCode: 'VAL_INVALID_INPUT',
        message: `Month ${ledgerMonth} is already closed/rolled over`,
      });
    }

    let carryForwardExpenseCount = 0;

    if (group.carryForwardEnabled) {
      const summary = await this.getCarryForwardSummary(
        userId,
        groupId,
        ledgerMonth,
      );
      const balances = summary.map((s) => ({
        userId: s.userId,
        balance: s.netBalance,
      }));

      const simplified = this.simplifyDebts(balances, group.currency);
      carryForwardExpenseCount = simplified.length;

      if (simplified.length > 0) {
        await this.dataSource.transaction(async (manager) => {
          for (const tx of simplified) {
            const debtorUser = await manager
              .getRepository(User)
              .findOne({ where: { id: tx.fromUserId } });
            const creditorUser = await manager
              .getRepository(User)
              .findOne({ where: { id: tx.toUserId } });
            if (!debtorUser || !creditorUser) continue;

            const expense = manager.create(Expense, {
              title: `Carry-Forward from ${ledgerMonth}`,
              description: `System-generated carry-forward balance rollover`,
              amountTotal: tx.amount,
              currency: group.currency,
              category: 'Other',
              paidByUser: creditorUser,
              ownerUser: callerMember.user,
              group,
              expenseDate: `${nextLedgerMonth}-01`,
              ledgerMonth: nextLedgerMonth,
              isCarryForward: true,
              status: 'posted',
            });
            const savedExpense = await manager.save(Expense, expense);

            const split = manager.create(ExpenseSplit, {
              expense: savedExpense,
              participantUser: debtorUser,
              splitType: 'fixed',
              shareValue: tx.amount,
              amountOwed: tx.amount,
              isSettled: false,
            });
            await manager.save(ExpenseSplit, split);
          }
        });
      }
    }

    // Write audit log
    void this.writeAuditLog({
      actorUser: callerMember.user,
      action: 'group.month_closed',
      entityId: groupId,
      groupId,
      metadata: { ledgerMonth, nextLedgerMonth, carryForwardExpenseCount },
    });

    return { nextLedgerMonth, carryForwardExpenseCount };
  }

  /**
   * List soft-deleted expenses (for group history / restore UI).
   * Returns only expenses with deletedAt set, within the given group.
   */
  async listDeletedExpenses(
    userId: string,
    groupId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<Record<string, unknown>>> {
    await this.assertGroupAccess(userId, groupId);

    const p = page > 0 ? page : 1;
    const l = limit > 0 ? limit : 20;

    // Use createQueryBuilder with withDeleted so we can filter to only soft-deleted rows
    const query = this.expenseRepository
      .createQueryBuilder('expense')
      .leftJoinAndSelect('expense.paidByUser', 'paidByUser')
      .leftJoinAndSelect('expense.ownerUser', 'ownerUser')
      .leftJoinAndSelect('expense.group', 'group')
      .where('group.id = :groupId', { groupId })
      .andWhere('expense.deletedAt IS NOT NULL')
      .withDeleted()
      .orderBy('expense.deletedAt', 'DESC');

    const total = await query.getCount();
    const expenses = await query
      .skip((p - 1) * l)
      .take(l)
      .getMany();

    const mapped = await Promise.all(
      expenses.map((e) => this.mapExpenseResponse(e)),
    );
    return paginate(
      mapped,
      total,
      p,
      l,
      `/api/v1/groups/${groupId}/expenses/deleted`,
      {},
    );
  }

  /** Combined category-level aggregated monthly expenditures (personal + group splits) */
  async getCombinedMonthlyAnalytics(
    userId: string,
    month: string,
  ): Promise<{ category: string; amount: number; currency: string }[]> {
    // 1. Get all group-less posted expenses paid by the user in this month
    const paidPersonalExpenses = await this.expenseRepository
      .createQueryBuilder('expense')
      .leftJoinAndSelect('expense.paidByUser', 'paidByUser')
      .where('expense.group IS NULL')
      .andWhere('paidByUser.id = :userId', { userId })
      .andWhere('expense.status = :status', { status: 'posted' })
      .andWhere('expense.expenseDate LIKE :monthPrefix', {
        monthPrefix: `${month}%`,
      })
      .getMany();

    // 2. Fetch splits for those personal expenses to identify which are 100% personal vs direct splits
    const paidPersonalExpenseIds = paidPersonalExpenses.map((e) => e.id);
    const personalSplits = paidPersonalExpenseIds.length
      ? await this.expenseSplitRepository.find({
          where: { expense: { id: In(paidPersonalExpenseIds) } },
          relations: ['expense'],
        })
      : [];
    const personalExpenseHasSplits = new Set(
      personalSplits.map((s) => s.expense.id),
    );

    // 3. Get all splits where the user is a participant (either direct user split or group member split)
    const userSplits = await this.expenseSplitRepository
      .createQueryBuilder('split')
      .innerJoinAndSelect('split.expense', 'expense')
      .leftJoin('split.participantGroupMember', 'groupMember')
      .where('expense.status = :status', { status: 'posted' })
      .andWhere(
        '(expense.ledgerMonth = :month OR expense.expenseDate LIKE :monthPrefix)',
        { month, monthPrefix: `${month}%` },
      )
      .andWhere(
        '(split.participantUserId = :userId OR groupMember.user_id = :userId)',
        { userId },
      )
      .getMany();

    const categorySum = new Map<string, { amount: number; currency: string }>();

    // Add 100% personal expenses (paid by user, group is null, no splits exist)
    for (const exp of paidPersonalExpenses) {
      if (!personalExpenseHasSplits.has(exp.id)) {
        const cat = exp.category || 'Other';
        const amount = Number(exp.amountTotal);
        const curr = exp.currency || 'USD';
        const key = `${cat}_${curr}`;
        const entry = categorySum.get(key) ?? { amount: 0, currency: curr };
        entry.amount += amount;
        categorySum.set(key, entry);
      }
    }

    // Add split shares (owes) for both group and direct split expenses
    for (const split of userSplits) {
      const exp = split.expense;
      const cat = exp.category || 'Other';
      const amount = Number(split.amountOwed);
      const curr = exp.currency || 'USD';
      const key = `${cat}_${curr}`;
      const entry = categorySum.get(key) ?? { amount: 0, currency: curr };
      entry.amount += amount;
      categorySum.set(key, entry);
    }

    return Array.from(categorySum.entries()).map(([key, value]) => {
      const lastUnderscore = key.lastIndexOf('_');
      const category = key.substring(0, lastUnderscore);
      return {
        category,
        amount: Math.round(value.amount * 100) / 100,
        currency: value.currency,
      };
    });
  }
}
