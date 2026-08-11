/*
 * Phase 3 end-to-end UAT harness for the People / P2P flow. Runs against the
 * LOCAL dev Postgres only (DATABASE_URL is force-set to localhost before
 * ormconfig loads — it can never touch the .env Neon DB). Exercises the real
 * SettlementsService + PersonLedgerService end to end.
 *
 *   npx ts-node --project backend/tsconfig.app.json -r tsconfig-paths/register backend/uat-p2p.ts
 *
 * Not part of the app build. Safe to delete after review.
 */

process.env.DATABASE_URL =
  'postgresql://finmate_user:finmate_password@localhost:5432/finmate_dev';
process.env.DB_SSL = 'false';

import AppDataSource from './src/ormconfig';
import {
  AuditLog,
  DirectLedgerEntry,
  Expense,
  ExpensePayment,
  ExpenseSplit,
  Group,
  GroupKeyVersion,
  GroupMember,
  Settlement,
  User,
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
  await AppDataSource.runMigrations();

  const userRepo = AppDataSource.getRepository(User);
  const groupRepo = AppDataSource.getRepository(Group);
  const gmRepo = AppDataSource.getRepository(GroupMember);
  const expRepo = AppDataSource.getRepository(Expense);
  const splitRepo = AppDataSource.getRepository(ExpenseSplit);
  const payRepo = AppDataSource.getRepository(ExpensePayment);

  const tag = Date.now();
  const mkUser = (n: string) =>
    userRepo.save(userRepo.create({ email: `${n}-${tag}@t.local`, passwordHash: 'x', displayName: n }));
  const mkGroup = (name: string, owner: User, type: 'normal' | 'household', currency = 'USD') =>
    groupRepo.save(groupRepo.create({ name: `${name}-${tag}`, ownerUser: owner, currency, groupType: type }));
  const mkMember = (group: Group, user: User) =>
    gmRepo.save(gmRepo.create({ group, user, role: 'member', joinStatus: 'active', joinedAt: new Date() }));
  const mkExpense = (
    group: Group, owner: User, payer: GroupMember, total: number,
    txnType: 'expense' | 'refund' = 'expense', currency = 'USD',
  ) =>
    expRepo.save(expRepo.create({
      title: 'cipher', amountTotal: total, currency, category: 'general', ownerUser: owner,
      group, paidByGroupMember: payer, expenseDate: '2026-08-02', status: 'posted',
      transactionType: txnType, encryptionScope: 'group',
    }));
  const mkSplit = (e: Expense, m: GroupMember, owed: number) =>
    splitRepo.save(splitRepo.create({ expense: e, participantGroupMember: m, splitType: 'fixed', shareValue: owed, amountOwed: owed }));
  const mkPayment = (e: Expense, m: GroupMember, amount: number) =>
    payRepo.save(payRepo.create({ expense: e, paidByGroupMember: m, amount }));

  const settlements = new SettlementsService(
    groupRepo, gmRepo, expRepo, splitRepo, payRepo,
    AppDataSource.getRepository(Settlement), AppDataSource.getRepository(AuditLog), AppDataSource,
  );
  const people = new PersonLedgerService(
    gmRepo, expRepo, splitRepo, payRepo,
    AppDataSource.getRepository(Settlement), AppDataSource.getRepository(DirectLedgerEntry), userRepo,
  );
  const net = async (a: string, b: string) => (await people.getPersonDetail(a, b)).netBalance;

  // ── UAT 1–3: Direct lend, partial + full settlement (history preserved) ──────
  console.log('\n[UAT 1-3] Direct lend + partial/full settlement…');
  {
    const a = await mkUser('u1a');
    const b = await mkUser('u1b');
    await people.createDirectTransaction(a.id, b.id, { entryType: 'lend', amount: 1, currency: 'USD', occurredOn: '2026-08-01' });
    check('after lend ₹1: B owes A ₹1', approx(await net(a.id, b.id), 1));
    await people.createDirectTransaction(a.id, b.id, { entryType: 'lend', amount: 3, currency: 'USD', occurredOn: '2026-08-02' });
    check('after lend ₹3: B owes A ₹4', approx(await net(a.id, b.id), 4));

    await people.createDirectSettlement(a.id, b.id, { amount: 2, currency: 'USD', occurredOn: '2026-08-03' });
    check('after return ₹2: B owes A ₹2', approx(await net(a.id, b.id), 2));
    let d = await people.getPersonDetail(a.id, b.id);
    check('history has 3 lines (lend1, lend3, settle2) — originals intact',
      d.history.length === 3 &&
      d.history.filter((h) => h.source === 'direct').length === 2 &&
      d.history.filter((h) => h.source === 'settlement').length === 1, d.history.map((h) => `${h.source}:${h.amount}`));

    await people.createDirectSettlement(a.id, b.id, { amount: 2, currency: 'USD', occurredOn: '2026-08-04' });
    check('after full return ₹2: settled (₹0)', approx(await net(a.id, b.id), 0));
    d = await people.getPersonDetail(a.id, b.id);
    check('direction is settled at ₹0', d.direction === 'settled');
    check('history preserved after full settlement (4 lines)', d.history.length === 4, d.history.length);
  }

  // ── UAT 4: Reverse relationship (borrow) + partial settle ────────────────────
  console.log('\n[UAT 4] Reverse relationship (borrow)…');
  {
    const a = await mkUser('u4a');
    const b = await mkUser('u4b');
    await people.createDirectTransaction(a.id, b.id, { entryType: 'borrow', amount: 500, currency: 'USD', occurredOn: '2026-08-01' });
    check('after borrow ₹500: A owes B (net −500)', approx(await net(a.id, b.id), -500));
    const d = await people.getPersonDetail(a.id, b.id);
    check('direction is you_owe', d.direction === 'you_owe');
    await people.createDirectSettlement(a.id, b.id, { amount: 200, currency: 'USD', occurredOn: '2026-08-05' });
    check('after settle ₹200: A owes B ₹300 (net −300)', approx(await net(a.id, b.id), -300));
  }

  // ── UAT 5: Group equal split, multiple payers ────────────────────────────────
  console.log('\n[UAT 5] Group equal split, multi-payer (A1/B2/C3 pay, 2 each)…');
  {
    const [a, b, c] = [await mkUser('u5a'), await mkUser('u5b'), await mkUser('u5c')];
    const g = await mkGroup('u5', a, 'normal');
    const [ma, mb, mc] = [await mkMember(g, a), await mkMember(g, b), await mkMember(g, c)];
    const e = await mkExpense(g, a, ma, 6);
    await mkSplit(e, ma, 2); await mkSplit(e, mb, 2); await mkSplit(e, mc, 2);
    await mkPayment(e, ma, 1); await mkPayment(e, mb, 2); await mkPayment(e, mc, 3);
    check('A owes C ₹1', approx(await net(a.id, c.id), -1));
    check('no incorrect A↔B debt', approx(await net(a.id, b.id), 0));
  }

  // ── UAT 6: Unequal shares, single payer ──────────────────────────────────────
  console.log('\n[UAT 6] Unequal shares (2/3/5), A pays ₹10…');
  {
    const [a, b, c] = [await mkUser('u6a'), await mkUser('u6b'), await mkUser('u6c')];
    const g = await mkGroup('u6', a, 'normal');
    const [ma, mb, mc] = [await mkMember(g, a), await mkMember(g, b), await mkMember(g, c)];
    const e = await mkExpense(g, a, ma, 10);
    await mkSplit(e, ma, 2); await mkSplit(e, mb, 3); await mkSplit(e, mc, 5);
    await mkPayment(e, ma, 10);
    check('B owes A ₹3', approx(await net(a.id, b.id), 3));
    check('C owes A ₹5', approx(await net(a.id, c.id), 5));
    const owed = (await people.getPersonDetail(a.id, b.id)).netBalance + (await people.getPersonDetail(a.id, c.id)).netBalance;
    check('A is owed ₹8 total', approx(owed, 8));
  }

  // ── UAT 7: Multi-payer (§7) ──────────────────────────────────────────────────
  console.log('\n[UAT 7] Multi-payer (shares 2/3/5; pay 4/6/0)…');
  {
    const [a, b, c] = [await mkUser('u7a'), await mkUser('u7b'), await mkUser('u7c')];
    const g = await mkGroup('u7', a, 'normal');
    const [ma, mb, mc] = [await mkMember(g, a), await mkMember(g, b), await mkMember(g, c)];
    const e = await mkExpense(g, a, ma, 10);
    await mkSplit(e, ma, 2); await mkSplit(e, mb, 3); await mkSplit(e, mc, 5);
    await mkPayment(e, ma, 4); await mkPayment(e, mb, 6);
    check('C owes A ₹2', approx(await net(a.id, c.id), 2));
    check('C owes B ₹3', approx(await net(b.id, c.id), 3));
  }

  // ── UAT 8: Household exclusion ───────────────────────────────────────────────
  console.log('\n[UAT 8] Household exclusion…');
  {
    const a = await mkUser('u8a'); const b = await mkUser('u8b');
    const gh = await mkGroup('u8h', a, 'household');
    const [ma, mb] = [await mkMember(gh, a), await mkMember(gh, b)];
    const e = await mkExpense(gh, a, ma, 100);
    (e as any).ledgerMonth = '2026-08'; await expRepo.save(e);
    await mkSplit(e, ma, 50); await mkSplit(e, mb, 50); await mkPayment(e, ma, 100);
    const d = await people.getPersonDetail(a.id, b.id);
    check('household creates NO P2P debt', approx(d.netBalance, 0));
    check('household absent from People history', d.history.length === 0, d.history.length);
  }

  // ── UAT 9: Refund interaction ────────────────────────────────────────────────
  console.log('\n[UAT 9] Refund interaction (expense then refund)…');
  {
    const a = await mkUser('u9a'); const b = await mkUser('u9b');
    const g = await mkGroup('u9', a, 'normal');
    const [ma, mb] = [await mkMember(g, a), await mkMember(g, b)];
    const e = await mkExpense(g, a, ma, 100);              // A pays 100, split 50/50 → B owes A 50
    await mkSplit(e, ma, 50); await mkSplit(e, mb, 50); await mkPayment(e, ma, 100);
    check('before refund: B owes A ₹50', approx(await net(a.id, b.id), 50));
    const r = await mkExpense(g, a, ma, 40, 'refund');     // A receives 40 back, split 20/20 → inverts
    await mkSplit(r, ma, 20); await mkSplit(r, mb, 20); await mkPayment(r, ma, 40);
    check('after refund: B owes A ₹30 (refund reduces debt)', approx(await net(a.id, b.id), 30));
    // group ledger still correct (A net = paid100 -own50 -refund(paid40-own20) = +30)
    const gb = await settlements.calculateGroupBalances(a.id, g.id);
    const aBal = gb.overall.balances.find((x: any) => x.userId === a.id)?.netBalance;
    check('group balance for A remains ₹30', approx(aBal, 30), aBal);
  }

  // ── UAT 10: Source navigation fields present on group history ────────────────
  console.log('\n[UAT 10] Source references + decryption hints on group history…');
  {
    const a = await mkUser('u10a'); const b = await mkUser('u10b');
    const g = await mkGroup('Goa', a, 'normal');
    const [ma, mb] = [await mkMember(g, a), await mkMember(g, b)];
    // Real group expenses always carry a key version (assigned in createExpense);
    // seed one so the decryption-hint assertion reflects production behaviour.
    const kv = await AppDataSource.getRepository(GroupKeyVersion).save(
      AppDataSource.getRepository(GroupKeyVersion).create({ group: g, version: 1, status: 'ACTIVE' }),
    );
    const e = await mkExpense(g, a, ma, 10);
    (e as any).groupKeyVersion = kv; await expRepo.save(e);
    await mkSplit(e, ma, 5); await mkSplit(e, mb, 5); await mkPayment(e, ma, 10);
    const d = await people.getPersonDetail(a.id, b.id);
    const line = d.history.find((h) => h.source === 'group_expense');
    check('group history line carries groupId/groupName/expenseId',
      !!line && line.groupId === g.id && !!line.groupName && line.expenseId === e.id, line);
    check('group history line carries decryption hints (scope + keyVersion)',
      !!line && line.encryptionScope === 'group' && !!line.groupKeyVersionId, line);
    check('title is passed through as ciphertext for client-side decryption', line?.title === 'cipher');
  }

  // ── UAT 11 & 15: Overview totals, dominant currency, multi-currency flag ─────
  console.log('\n[UAT 11/15] Overview totals + currency safety…');
  {
    const me = await mkUser('u11me');
    const usdFriend = await mkUser('u11usd');
    const inrFriend = await mkUser('u11inr');
    // USD: they owe me 300 (dominant). INR: I owe 50.
    await people.createDirectTransaction(me.id, usdFriend.id, { entryType: 'lend', amount: 300, currency: 'USD', occurredOn: '2026-08-01' });
    await people.createDirectTransaction(me.id, inrFriend.id, { entryType: 'borrow', amount: 50, currency: 'INR', occurredOn: '2026-08-01' });
    const ov = await people.getOverview(me.id);
    check('hasMultipleCurrencies flagged', ov.hasMultipleCurrencies === true, ov);
    check('dominant currency is USD (largest activity)', ov.currency === 'USD', ov.currency);
    check('totals are single-currency (USD), not a mixed sum', approx(ov.totalYouAreOwed, 300) && approx(ov.totalYouOwe, 0), ov);
    check('both people listed with their own currency', ov.people.length === 2 &&
      ov.people.some((p) => p.currency === 'USD') && ov.people.some((p) => p.currency === 'INR'), ov.people);
    const limited = await people.getOverview(me.id, 1);
    check('limit caps the dashboard list to 1', limited.people.length === 1);
  }

  await AppDataSource.destroy();
  console.log(`\n──────────────\nUAT RESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(2); });
