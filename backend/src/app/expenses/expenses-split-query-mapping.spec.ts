import 'reflect-metadata';
import { DataSource } from 'typeorm';
import {
  Contact,
  Expense,
  ExpenseSplit,
  Group,
  GroupKeyVersion,
  GroupMember,
  User,
} from '@finmate/data-models';
import { SnakeNamingStrategy } from '../common/snake-naming-strategy';

/**
 * Regression guard for the "Personal Dashboard shows no group expenses" bug.
 *
 * listMyExpenses() and getCombinedMonthlyAnalytics() filter ExpenseSplit rows
 * with a raw QueryBuilder WHERE string. TypeORM only rewrites `alias.token`
 * fragments in raw strings when `token` is an exact relation propertyPath
 * (e.g. `participantUser`) or an exact physical column name (e.g.
 * `participant_user_id`) — see node_modules/typeorm/query-builder/QueryBuilder.js
 * `replacePropertyNamesForTheWholeQuery`. A previous version of these queries
 * used `split.participantUserId`, which matches neither, so TypeORM left it
 * as unescaped literal text. Postgres then folds the unquoted identifier to
 * lowercase (`participantuserid`), which doesn't exist on `expense_splits`
 * (the real column is `participant_user_id`), so every call failed with
 * `column split.participantuserid does not exist` — regardless of whether
 * the user actually had any group splits.
 *
 * Unit tests that mock `where`/`andWhere` with `jest.fn().mockReturnThis()`
 * can't catch this, because the raw condition string is never parsed. This
 * spec builds the *real* TypeORM query against the *real* entity metadata
 * (via SnakeNamingStrategy, matching production config) and inspects the
 * generated SQL directly — no live DB connection is required for SQL
 * generation, only for execution, so this runs in the normal unit-test
 * suite while still exercising the actual entity mapping.
 */
describe('ExpenseSplit query mapping (participant filter)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'unused',
      password: 'unused',
      database: 'unused',
      entities: [
        Expense,
        ExpenseSplit,
        Group,
        GroupMember,
        GroupKeyVersion,
        User,
        Contact,
      ],
      namingStrategy: new SnakeNamingStrategy(),
    });
    // Building metadata does not open a socket connection; it only compiles
    // decorators into EntityMetadata, which is all SQL generation needs.
    await (
      dataSource as unknown as { buildMetadatas(): Promise<void> }
    ).buildMetadatas();
  });

  function buildGroupSplitsQuery(userId: string) {
    return dataSource
      .createQueryBuilder(ExpenseSplit, 'split')
      .innerJoinAndSelect('split.expense', 'expense')
      .leftJoinAndSelect('expense.paidByUser', 'paidByUser')
      .leftJoinAndSelect('expense.group', 'group')
      .leftJoinAndSelect('expense.groupKeyVersion', 'gkv')
      .leftJoin('split.participantGroupMember', 'groupMember')
      .where('expense.deletedAt IS NULL')
      .andWhere(
        '(split.participantUser = :userId OR groupMember.user_id = :userId)',
        { userId },
      );
  }

  function buildUserSplitsQuery(userId: string, month: string) {
    // Mirrors ExpensesService.getCombinedMonthlyAnalytics' userSplits query.
    // Uses a half-open date range rather than `LIKE :monthPrefix` — the latter
    // is invalid on PostgreSQL against a `date` column (see regression test
    // below).
    const monthStart = `${month}-01`;
    const monthEnd = `${month.slice(0, 4)}-${String(
      Number(month.slice(5, 7)) + 1,
    ).padStart(2, '0')}-01`;
    return dataSource
      .createQueryBuilder(ExpenseSplit, 'split')
      .innerJoinAndSelect('split.expense', 'expense')
      .leftJoin('split.participantGroupMember', 'groupMember')
      .where('expense.status = :status', { status: 'posted' })
      .andWhere(
        '(expense.ledgerMonth = :month OR (expense.expenseDate >= :monthStart AND expense.expenseDate < :monthEnd))',
        { month, monthStart, monthEnd },
      )
      .andWhere(
        '(split.participantUser = :userId OR groupMember.user_id = :userId)',
        { userId },
      );
  }

  it('resolves the participant filter in listMyExpenses() groupSplits query to the real physical column', () => {
    const sql = buildGroupSplitsQuery('user-1').getSql();

    // The bug: an unresolved raw token is left completely unquoted.
    expect(sql).not.toMatch(/[^"]\bparticipantUserId\b/);
    // The fix: TypeORM must rewrite the relation shorthand to the actual
    // snake_case join column, quoted like every other resolved identifier.
    expect(sql).toContain('"split"."participant_user_id"');
    expect(sql).toContain('"groupMember"."user_id"');
  });

  it('resolves the participant filter in getCombinedMonthlyAnalytics() userSplits query to the real physical column', () => {
    const sql = buildUserSplitsQuery('user-1', '2026-07').getSql();

    expect(sql).not.toMatch(/[^"]\bparticipantUserId\b/);
    expect(sql).toContain('"split"."participant_user_id"');
    expect(sql).toContain('"groupMember"."user_id"');
  });

  it('filters the analytics month with a portable date range, not LIKE on the date column', () => {
    // Regression guard for the PostgreSQL-only 500
    // (`operator does not exist: date ~~ unknown`): `expenseDate` is a `date`
    // column, so `LIKE 'YYYY-MM%'` is rejected by PostgreSQL even though SQLite
    // tolerates it. A behaviour test on SQLite would NOT catch this — only real
    // PostgreSQL (or, as here, PostgreSQL SQL generation) surfaces it. The fix
    // uses a half-open [monthStart, monthEnd) range instead.
    const sql = buildUserSplitsQuery('user-1', '2026-07').getSql();

    // No LIKE against the date column.
    expect(sql).not.toMatch(/expense_date"?\s+LIKE/i);
    // Half-open range on the real physical column, quoted like every other
    // resolved identifier.
    expect(sql).toContain('"expense"."expense_date" >=');
    expect(sql).toContain('"expense"."expense_date" <');
  });

  it('would have failed on the pre-fix condition string (documents the exact failure mode)', () => {
    const brokenSql = dataSource
      .createQueryBuilder(ExpenseSplit, 'split')
      .leftJoin('split.participantGroupMember', 'groupMember')
      .where(
        '(split.participantUserId = :userId OR groupMember.user_id = :userId)',
        { userId: 'user-1' },
      )
      .getSql();

    // This is the literal, unescaped, unresolved fragment that Postgres
    // rejects with "column split.participantuserid does not exist".
    expect(brokenSql).toContain('split.participantUserId');
  });
});
