import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  EncryptedExpenseKey,
  Expense,
  ExpenseSplit,
} from '@finmate/data-models';
import { In, Repository, SelectQueryBuilder } from 'typeorm';

/** Upper bound on rows a single export may return, to bound memory/response size. */
export const MAX_EXPORT_ROWS = 10000;

export interface ExportFilter {
  from?: string;
  to?: string;
  type?: 'personal' | 'group' | 'all';
  category?: string;
  status?: 'settled' | 'pending';
  currency?: string;
}

/**
 * A single export row. `title`/`description` are ciphertext (the server is
 * zero-knowledge and cannot decrypt them); the client decrypts them with its
 * scope key before writing the workbook. Everything else is server-readable
 * metadata.
 */
export interface ExportRow {
  id: string;
  expenseDate: string;
  createdAt: Date;
  // ── Encrypted (client decrypts) ──────────────────────────────────────────
  title: string;
  description: string | null;
  encryptionScope: 'personal' | 'group' | 'direct_shared';
  groupId: string | null;
  groupKeyVersionId: string | null;
  wrappedContentKeys: Array<{ userId: string; wrappedKey: string }>;
  // ── Plaintext metadata ───────────────────────────────────────────────────
  amountTotal: number;
  myShare: number;
  currency: string;
  category: string;
  expenseType: 'PERSONAL' | 'GROUP_SHARE';
  groupName: string | null;
  paidByDisplayName: string | null;
  splitType: string | null;
  isSettled: boolean;
  status: string;
}

/**
 * Backend source of truth for export permissions and filtering.
 *
 * Returns the caller's personal expenses PLUS their share of group expenses
 * (via ExpenseSplit), scoped exactly like `ExpensesService.listMyExpenses` —
 * a user only has splits in groups they belong to, so this never exposes
 * another user's private data. Workbook generation lives entirely on the
 * client (see the frontend `ExpenseExportService`), keeping filtering separate
 * from file formatting so CSV/PDF can be added without touching this logic.
 */
@Injectable()
export class ExpenseExportQueryService {
  constructor(
    @InjectRepository(Expense)
    private readonly expenseRepository: Repository<Expense>,
    @InjectRepository(ExpenseSplit)
    private readonly expenseSplitRepository: Repository<ExpenseSplit>,
    @InjectRepository(EncryptedExpenseKey)
    private readonly encryptedExpenseKeyRepository: Repository<EncryptedExpenseKey>,
  ) {}

  private static readonly DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  private assertValidDate(value: string | undefined, label: string): void {
    if (value && !ExpenseExportQueryService.DATE_RE.test(value)) {
      throw new BadRequestException({
        errorCode: 'VAL_INVALID_INPUT',
        message: `${label} must use YYYY-MM-DD format`,
      });
    }
  }

  /**
   * Resolve the filtered export rows for a user. Newest expense first.
   * Throws EXP_EXPORT_TOO_LARGE if the result would exceed MAX_EXPORT_ROWS.
   */
  async getExportRows(userId: string, filter: ExportFilter): Promise<ExportRow[]> {
    this.assertValidDate(filter.from, 'from');
    this.assertValidDate(filter.to, 'to');
    if (filter.from && filter.to && filter.from > filter.to) {
      throw new BadRequestException({
        errorCode: 'VAL_INVALID_INPUT',
        message: '`from` date must not be after `to` date',
      });
    }

    const type = filter.type ?? 'all';
    const currency = filter.currency?.toUpperCase();

    // A specific settlement status only applies to group shares — personal
    // expenses have no settlement concept, so exclude them when it's set.
    const includePersonal =
      (type === 'all' || type === 'personal') && !filter.status;
    const includeGroup = type === 'all' || type === 'group';

    const rows: ExportRow[] = [];
    const seen = new Set<string>();

    if (includePersonal) {
      const personal = await this.buildPersonalQuery(
        userId,
        filter,
        currency,
      ).getMany();
      for (const exp of personal) {
        if (seen.has(exp.id)) continue;
        seen.add(exp.id);
        rows.push({
          id: exp.id,
          expenseDate: exp.expenseDate,
          createdAt: exp.createdAt,
          title: exp.title,
          description: exp.description ?? null,
          encryptionScope: exp.encryptionScope ?? 'personal',
          groupId: null,
          groupKeyVersionId: exp.groupKeyVersion?.id ?? null,
          wrappedContentKeys: [],
          amountTotal: Number(exp.amountTotal),
          myShare: Number(exp.amountTotal),
          currency: exp.currency,
          category: exp.category,
          expenseType: 'PERSONAL',
          groupName: null,
          paidByDisplayName:
            exp.paidByUser?.displayName ?? exp.paidByUser?.email ?? null,
          splitType: null,
          isSettled: false,
          status: exp.status,
        });
      }
    }

    if (includeGroup) {
      const splits = await this.buildGroupSplitQuery(
        userId,
        filter,
        currency,
      ).getMany();
      for (const split of splits) {
        const exp = split.expense;
        if (!exp || seen.has(exp.id)) continue;
        seen.add(exp.id);
        rows.push({
          id: exp.id,
          expenseDate: exp.expenseDate,
          createdAt: exp.createdAt,
          title: exp.title,
          description: exp.description ?? null,
          encryptionScope: exp.encryptionScope ?? 'group',
          groupId: exp.group?.id ?? null,
          groupKeyVersionId: exp.groupKeyVersion?.id ?? null,
          wrappedContentKeys: [],
          amountTotal: Number(exp.amountTotal),
          myShare: Number(split.amountOwed),
          currency: exp.currency,
          category: exp.category,
          expenseType: 'GROUP_SHARE',
          groupName: exp.group?.name ?? null,
          // Frozen rule: a group expense's payer resolves via paidByGroupMember;
          // paidByUser is only ever populated for legacy, pre-migration rows.
          paidByDisplayName:
            exp.paidByUser?.displayName ??
            exp.paidByUser?.email ??
            exp.paidByGroupMember?.user?.displayName ??
            exp.paidByGroupMember?.user?.email ??
            exp.paidByGroupMember?.contact?.displayName ??
            exp.paidByGroupMember?.contact?.email ??
            null,
          splitType: split.splitType ?? null,
          isSettled: split.isSettled ?? false,
          status: exp.status,
        });
      }
    }

    if (rows.length > MAX_EXPORT_ROWS) {
      throw new BadRequestException({
        errorCode: 'EXP_EXPORT_TOO_LARGE',
        message: `Export exceeds the ${MAX_EXPORT_ROWS.toLocaleString()}-record limit. Narrow the date range or filters and try again.`,
      });
    }

    // Attach wrapped content keys for any direct_shared rows so the client can
    // unwrap the per-expense content key. Group/personal scopes never need them.
    await this.attachWrappedKeys(rows);

    // Newest expense first (ties broken by createdAt) for a stable ordering.
    rows.sort((a, b) => {
      const byDate = String(b.expenseDate).localeCompare(String(a.expenseDate));
      if (byDate !== 0) return byDate;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    return rows;
  }

  private buildPersonalQuery(
    userId: string,
    filter: ExportFilter,
    currency: string | undefined,
  ): SelectQueryBuilder<Expense> {
    const qb = this.expenseRepository
      .createQueryBuilder('expense')
      .leftJoinAndSelect('expense.paidByUser', 'paidByUser')
      .leftJoinAndSelect('expense.ownerUser', 'ownerUser')
      .leftJoinAndSelect('expense.groupKeyVersion', 'gkv')
      .where('expense.group IS NULL')
      .andWhere('ownerUser.id = :userId', { userId })
      .andWhere('expense.deletedAt IS NULL');

    this.applyExpenseFilters(qb, filter, currency);
    return qb.take(MAX_EXPORT_ROWS + 1);
  }

  private buildGroupSplitQuery(
    userId: string,
    filter: ExportFilter,
    currency: string | undefined,
  ): SelectQueryBuilder<ExpenseSplit> {
    const qb = this.expenseSplitRepository
      .createQueryBuilder('split')
      .innerJoinAndSelect('split.expense', 'expense')
      .leftJoinAndSelect('expense.paidByUser', 'paidByUser')
      .leftJoinAndSelect('expense.paidByGroupMember', 'paidByGroupMember')
      .leftJoinAndSelect('paidByGroupMember.user', 'paidByGroupMemberUser')
      .leftJoinAndSelect('paidByGroupMember.contact', 'paidByGroupMemberContact')
      .leftJoinAndSelect('expense.group', 'group')
      .leftJoinAndSelect('expense.groupKeyVersion', 'gkv')
      .leftJoin('split.participantGroupMember', 'groupMember')
      .where('expense.deletedAt IS NULL')
      .andWhere('expense.group IS NOT NULL')
      .andWhere('(split.participantUser = :userId OR groupMember.user_id = :userId)', {
        userId,
      });

    this.applyExpenseFilters(qb, filter, currency);

    if (filter.status) {
      qb.andWhere('split.isSettled = :isSettled', {
        isSettled: filter.status === 'settled',
      });
    }

    return qb.take(MAX_EXPORT_ROWS + 1);
  }

  /** Date-range / category / currency filters, shared by both queries. */
  private applyExpenseFilters(
    qb: SelectQueryBuilder<Expense | ExpenseSplit>,
    filter: ExportFilter,
    currency: string | undefined,
  ): void {
    if (filter.from) {
      qb.andWhere('expense.expenseDate >= :from', { from: filter.from });
    }
    if (filter.to) {
      qb.andWhere('expense.expenseDate <= :to', { to: filter.to });
    }
    if (filter.category) {
      qb.andWhere('expense.category = :category', { category: filter.category });
    }
    if (currency) {
      qb.andWhere('UPPER(expense.currency) = :currency', { currency });
    }
  }

  private async attachWrappedKeys(rows: ExportRow[]): Promise<void> {
    const directIds = rows
      .filter((r) => r.encryptionScope === 'direct_shared')
      .map((r) => r.id);
    if (directIds.length === 0) return;

    const keys = await this.encryptedExpenseKeyRepository.find({
      where: { expense: { id: In(directIds) } },
      relations: ['expense', 'user'],
    });

    const byExpenseId = new Map<
      string,
      Array<{ userId: string; wrappedKey: string }>
    >();
    for (const key of keys) {
      const eid = key.expense.id;
      const arr = byExpenseId.get(eid) ?? [];
      arr.push({ userId: key.user.id, wrappedKey: key.wrappedKey });
      byExpenseId.set(eid, arr);
    }

    for (const row of rows) {
      const wrapped = byExpenseId.get(row.id);
      if (wrapped) row.wrappedContentKeys = wrapped;
    }
  }
}
