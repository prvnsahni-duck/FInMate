/*
 * One-off verification harness for the person-to-person / multi-payer backend.
 * Runs against the LOCAL dev Postgres only (DATABASE_URL is force-set to
 * localhost before ormconfig loads, so it can never touch the .env Neon DB).
 *
 *   npx ts-node --project backend/tsconfig.app.json -r tsconfig-paths/register backend/verify-p2p-migration.ts
 *
 * Not part of the app build. Safe to delete after review.
 */

// Force the local dev DB BEFORE importing ormconfig (dotenv won't override
// an already-set process.env var), guaranteeing we never hit the Neon URL.
process.env.DATABASE_URL =
  'postgresql://finmate_user:finmate_password@localhost:5432/finmate_dev';
process.env.DB_SSL = 'false';

import AppDataSource from './src/ormconfig';
import {
  DirectLedgerEntry,
  Expense,
  ExpensePayment,
  ExpenseSplit,
  Group,
  GroupMember,
  Settlement,
  User,
  AuditLog,
} from '@finmate/data-models';
import { SettlementsService } from './src/app/settlements/settlements.service';
import { PersonLedgerService } from './src/app/people/person-ledger.service';

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, detail?: unknown) => {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}`, detail ?? '');
  }
};
const approx = (a: number, b: number) => Math.abs(a - b) < 0.005;

async function main() {
  await AppDataSource.initialize();
  console.log('Connected to', (AppDataSource.options as any).url?.split('@')[1]);

  console.log('\n[0] Running migrations…');
  const ran = await AppDataSource.runMigrations();
  console.log(`  applied ${ran.length} migration(s)`);

  const q = AppDataSource.createQueryRunner();

  const userRepo = AppDataSource.getRepository(User);
  const groupRepo = AppDataSource.getRepository(Group);
  const gmRepo = AppDataSource.getRepository(GroupMember);
  const expRepo = AppDataSource.getRepository(Expense);
  const splitRepo = AppDataSource.getRepository(ExpenseSplit);
  const payRepo = AppDataSource.getRepository(ExpensePayment);

  const tag = Date.now();
  const mkUser = (n: string) =>
    userRepo.save(
      userRepo.create({
        email: `${n}-${tag}@test.local`,
        passwordHash: 'x',
        displayName: n,
      }),
    );
  const mkGroup = (name: string, owner: User, type: 'normal' | 'household') =>
    groupRepo.save(
      groupRepo.create({
        name: `${name}-${tag}`,
        ownerUser: owner,
        currency: 'USD',
        groupType: type,
      }),
    );
  const mkMember = (group: Group, user: User) =>
    gmRepo.save(
      gmRepo.create({
        group,
        user,
        role: 'member',
        joinStatus: 'active',
        joinedAt: new Date(),
      }),
    );
  const mkExpense = (group: Group, owner: User, payer: GroupMember, total: number) =>
    expRepo.save(
      expRepo.create({
        title: 'cipher',
        amountTotal: total,
        currency: 'USD',
        category: 'general',
        ownerUser: owner,
        group,
        paidByGroupMember: payer,
        expenseDate: '2026-08-02',
        status: 'posted',
        transactionType: 'expense',
        encryptionScope: 'group',
      }),
    );
  const mkSplit = (e: Expense, m: GroupMember, owed: number) =>
    splitRepo.save(
      splitRepo.create({
        expense: e,
        participantGroupMember: m,
        splitType: 'fixed',
        shareValue: owed,
        amountOwed: owed,
      }),
    );
  const mkPayment = (e: Expense, m: GroupMember, amount: number) =>
    payRepo.save(payRepo.create({ expense: e, paidByGroupMember: m, amount }));

  const settlements = new SettlementsService(
    groupRepo,
    gmRepo,
    expRepo,
    splitRepo,
    payRepo,
    AppDataSource.getRepository(Settlement),
    AppDataSource.getRepository(AuditLog),
    AppDataSource,
  );
  const people = new PersonLedgerService(
    gmRepo,
    expRepo,
    splitRepo,
    payRepo,
    AppDataSource.getRepository(Settlement),
    AppDataSource.getRepository(DirectLedgerEntry),
    userRepo,
  );

  const netWith = async (caller: string, other: string) =>
    (await people.getPersonDetail(caller, other)).netBalance;

  // ── [1] Backfill invariants ────────────────────────────────────────────────
  console.log('\n[1] Backfill invariant (legacy expenses → one payment each)…');
  {
    const u1 = await mkUser('bf1');
    const u2 = await mkUser('bf2');
    const g = await mkGroup('bf', u1, 'normal');
    const m1 = await mkMember(g, u1);
    await mkMember(g, u2);
    // Seed "legacy" expenses WITHOUT payment rows (as pre-migration rows would be).
    const e1 = await mkExpense(g, u1, m1, 30);
    const e2 = await mkExpense(g, u1, m1, 12.5);
    // Re-run the migration's idempotent backfill.
    await q.query(`
      INSERT INTO "expense_payments"
        ("id","expense_id","paid_by_user_id","paid_by_group_member_id","amount","version","created_at","updated_at")
      SELECT uuid_generate_v4(), e."id", e."paid_by_user_id", e."paid_by_group_member_id",
             e."amount_total", 1, now(), now()
      FROM "expenses" e
      WHERE NOT EXISTS (SELECT 1 FROM "expense_payments" p WHERE p."expense_id" = e."id")
    `);
    const rows: Array<{ expense_id: string; cnt: string; sum: string; mismatch: boolean }> =
      await q.query(`
        SELECT e.id AS expense_id,
               COUNT(p.id) AS cnt,
               COALESCE(SUM(p.amount),0) AS sum,
               (COALESCE(SUM(p.amount),0) <> e.amount_total) AS mismatch
        FROM expenses e
        LEFT JOIN expense_payments p ON p.expense_id = e.id AND p.deleted_at IS NULL
        WHERE e.id IN ('${e1.id}','${e2.id}')
        GROUP BY e.id, e.amount_total
      `);
    check('every legacy expense has exactly 1 payment', rows.every((r) => Number(r.cnt) === 1), rows);
    check('payment sum equals amount_total', rows.every((r) => !r.mismatch), rows);
    // Global invariant across the whole DB after migration.
    const orphans = await q.query(
      `SELECT COUNT(*) AS n FROM expenses e WHERE NOT EXISTS
         (SELECT 1 FROM expense_payments p WHERE p.expense_id=e.id AND p.deleted_at IS NULL)`,
    );
    check('no expense left without a payment row (global)', Number(orphans[0].n) === 0, orphans);
  }

  // ── [2] Single-payer balances unchanged ────────────────────────────────────
  console.log('\n[2] Single-payer: payments attribution == legacy paidBy* …');
  {
    const u1 = await mkUser('sp1');
    const u2 = await mkUser('sp2');
    const u3 = await mkUser('sp3');
    const g = await mkGroup('sp', u1, 'normal');
    const m1 = await mkMember(g, u1);
    const m2 = await mkMember(g, u2);
    const m3 = await mkMember(g, u3);
    const e = await mkExpense(g, u1, m1, 9); // ₹9 equal 3-way, U1 pays all
    await mkSplit(e, m1, 3);
    await mkSplit(e, m2, 3);
    await mkSplit(e, m3, 3);
    await mkPayment(e, m1, 9);

    const withPayments = await settlements.calculateGroupBalances(u1.id, g.id);
    // Remove payment rows → engine must fall back to expense.paidBy*.
    await q.query(`DELETE FROM expense_payments WHERE expense_id = '${e.id}'`);
    const fallback = await settlements.calculateGroupBalances(u1.id, g.id);

    const norm = (r: { overall: { balances: any[] } }) =>
      r.overall.balances
        .map((b) => `${b.userId}:${b.netBalance}`)
        .sort()
        .join('|');
    check(
      'balance identical with payments vs paidBy* fallback',
      norm(withPayments) === norm(fallback),
      { withPayments: norm(withPayments), fallback: norm(fallback) },
    );
    check('U1 net = +6 (paid 9, owes 3)', approx(
      withPayments.overall.balances.find((b: any) => b.userId === u1.id)?.netBalance,
      6,
    ));
  }

  // ── [3] Scenario A: direct lend + partial settlement ───────────────────────
  console.log('\n[3] Scenario A — direct lend + partial settlement…');
  {
    const u1 = await mkUser('dl1');
    const u2 = await mkUser('dl2');
    await people.createDirectTransaction(u1.id, u2.id, {
      entryType: 'lend',
      amount: 500,
      currency: 'USD',
      occurredOn: '2026-08-01',
    });
    check('after lend: U2 owes U1 500', approx(await netWith(u1.id, u2.id), 500));
    check('mirror: U1 owes U2 -500', approx(await netWith(u2.id, u1.id), -500));
    await people.createDirectSettlement(u1.id, u2.id, {
      amount: 200,
      currency: 'USD',
      occurredOn: '2026-08-10',
    });
    check('after partial return: U2 owes U1 300', approx(await netWith(u1.id, u2.id), 300));
    let rejected = false;
    try {
      await people.createDirectSettlement(u1.id, u2.id, {
        amount: 400,
        currency: 'USD',
        occurredOn: '2026-08-11',
      });
    } catch {
      rejected = true;
    }
    check('over-settlement (400 > 300) rejected', rejected);
    const detail = await people.getPersonDetail(u1.id, u2.id);
    check('history preserves lend + settlement (2 lines)', detail.history.length === 2, detail.history.map((h) => h.source));
    check('breakdown: directLending 500, settlements -200', detail.breakdown.some((b) => approx(b.directLending, 500) && approx(b.settlements, -200)), detail.breakdown);
  }

  // ── [4] Scenario B: equal split, multiple payers ───────────────────────────
  console.log('\n[4] Scenario B — equal split, multiple payers…');
  {
    const u1 = await mkUser('eb1');
    const u2 = await mkUser('eb2');
    const u3 = await mkUser('eb3');
    const g = await mkGroup('eb', u1, 'normal');
    const m1 = await mkMember(g, u1);
    const m2 = await mkMember(g, u2);
    const m3 = await mkMember(g, u3);
    const e = await mkExpense(g, u1, m1, 6); // ₹6 equal 3-way; M1 & M2 each pay 3
    await mkSplit(e, m1, 2);
    await mkSplit(e, m2, 2);
    await mkSplit(e, m3, 2);
    await mkPayment(e, m1, 3);
    await mkPayment(e, m2, 3);
    check('U3 owes U1 1', approx(await netWith(u1.id, u3.id), 1));
    check('U3 owes U2 1', approx(await netWith(u2.id, u3.id), 1));
    check('U1 & U2 (both overpaid) settled', approx(await netWith(u1.id, u2.id), 0));
  }

  // ── [5] Scenario C: unequal shares, single payer ───────────────────────────
  console.log('\n[5] Scenario C — unequal shares (2/3/5), single payer…');
  {
    const u1 = await mkUser('uc1');
    const u2 = await mkUser('uc2');
    const u3 = await mkUser('uc3');
    const g = await mkGroup('uc', u1, 'normal');
    const m1 = await mkMember(g, u1);
    const m2 = await mkMember(g, u2);
    const m3 = await mkMember(g, u3);
    const e = await mkExpense(g, u1, m1, 10); // A pays 10; shares 2/3/5
    await mkSplit(e, m1, 2);
    await mkSplit(e, m2, 3);
    await mkSplit(e, m3, 5);
    await mkPayment(e, m1, 10);
    check('U2 owes U1 3 (their share)', approx(await netWith(u1.id, u2.id), 3));
    check('U3 owes U1 5 (their share)', approx(await netWith(u1.id, u3.id), 5));
    const d = await people.getPersonDetail(u1.id, u2.id);
    check('history line links source expense + group', d.history[0]?.expenseId === e.id && d.history[0]?.groupId === g.id, d.history[0]);
  }

  // ── [6] Scenario D: unequal shares, multiple payers (§7) ───────────────────
  console.log('\n[6] Scenario D — unequal shares, multiple payers (§7)…');
  {
    const u1 = await mkUser('ud1');
    const u2 = await mkUser('ud2');
    const u3 = await mkUser('ud3');
    const g = await mkGroup('ud', u1, 'normal');
    const m1 = await mkMember(g, u1);
    const m2 = await mkMember(g, u2);
    const m3 = await mkMember(g, u3);
    const e = await mkExpense(g, u1, m1, 10); // shares 2/3/5; A pays 4, B pays 6
    await mkSplit(e, m1, 2);
    await mkSplit(e, m2, 3);
    await mkSplit(e, m3, 5);
    await mkPayment(e, m1, 4);
    await mkPayment(e, m2, 6);
    check('C owes A 2', approx(await netWith(u1.id, u3.id), 2));
    check('C owes B 3', approx(await netWith(u2.id, u3.id), 3));
    check('A & B (both overpaid) settled', approx(await netWith(u1.id, u2.id), 0));
  }

  // ── [7] Household expenses never create person-to-person debt ──────────────
  console.log('\n[7] Household exclusion…');
  {
    const uh1 = await mkUser('hh1');
    const uh2 = await mkUser('hh2');
    const gh = await mkGroup('hh', uh1, 'household');
    const m1 = await mkMember(gh, uh1);
    const m2 = await mkMember(gh, uh2);
    const e = await mkExpense(gh, uh1, m1, 100); // paid by uh1, split 50/50
    (e as any).ledgerMonth = '2026-08';
    await expRepo.save(e);
    await mkSplit(e, m1, 50);
    await mkSplit(e, m2, 50);
    await mkPayment(e, m1, 100);
    const detail = await people.getPersonDetail(uh1.id, uh2.id);
    check('household expense creates NO person-to-person debt', approx(detail.netBalance, 0), detail);
    check('household expense absent from People history', detail.history.length === 0, detail.history);
    // Sanity: the same shape in a NORMAL group WOULD create debt (control).
    const gn = await mkGroup('hh-control', uh1, 'normal');
    const n1 = await mkMember(gn, uh1);
    const n2 = await mkMember(gn, uh2);
    const en = await mkExpense(gn, uh1, n1, 100);
    await mkSplit(en, n1, 50);
    await mkSplit(en, n2, 50);
    await mkPayment(en, n1, 100);
    check('control: normal group DOES create debt (uh2 owes uh1 50)', approx(await netWith(uh1.id, uh2.id), 50));
  }

  await q.release();
  await AppDataSource.destroy();

  console.log(`\n──────────────\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('HARNESS ERROR:', e);
  process.exit(2);
});
