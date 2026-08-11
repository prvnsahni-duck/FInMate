import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds two tables for the person-to-person (Splitwise-style) balances feature:
 *
 *  1. `expense_payments` — multi-payer support. One row per payer of an expense.
 *     Existing single-payer expenses are backfilled with a single payment row
 *     derived from their primary `paid_by_*` payer and `amount_total`, so the
 *     balance engine's new "read payments" path reproduces current numbers
 *     exactly. The legacy `expenses.paid_by_*` columns are kept as the primary
 *     payer. Additive and reversible (down() drops the table).
 *
 *  2. `direct_ledger_entries` — group-less direct lend/borrow/settlement between
 *     two registered users.
 */
export class AddExpensePaymentsAndDirectLedger1719900000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. expense_payments ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "expense_payments" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "expense_id" UUID NOT NULL REFERENCES "expenses"("id") ON DELETE CASCADE,
        "paid_by_user_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
        "paid_by_group_member_id" UUID REFERENCES "group_members"("id") ON DELETE SET NULL,
        "amount" DECIMAL(12, 2) NOT NULL,
        "version" INTEGER DEFAULT 1 NOT NULL,
        "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
        "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
        "deleted_at" TIMESTAMPTZ,
        CONSTRAINT "chk_expense_payments_payer" CHECK (
          ("paid_by_user_id" IS NOT NULL AND "paid_by_group_member_id" IS NULL) OR
          ("paid_by_user_id" IS NULL AND "paid_by_group_member_id" IS NOT NULL)
        )
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_expense_payments_expense" ON "expense_payments" ("expense_id")`,
    );

    // Backfill one payment per existing expense from its primary payer. Idempotent
    // via the NOT EXISTS guard so re-running is safe.
    await queryRunner.query(`
      INSERT INTO "expense_payments"
        ("id", "expense_id", "paid_by_user_id", "paid_by_group_member_id", "amount", "version", "created_at", "updated_at")
      SELECT
        uuid_generate_v4(), e."id", e."paid_by_user_id", e."paid_by_group_member_id",
        e."amount_total", 1, now(), now()
      FROM "expenses" e
      WHERE NOT EXISTS (
        SELECT 1 FROM "expense_payments" p WHERE p."expense_id" = e."id"
      )
    `);

    // ── 2. direct_ledger_entries ───────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "direct_ledger_entries" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "from_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "to_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "created_by_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "entry_type" VARCHAR(16) NOT NULL,
        "amount" DECIMAL(12, 2) NOT NULL,
        "currency" CHAR(3) NOT NULL,
        "note" TEXT,
        "occurred_on" DATE NOT NULL,
        "version" INTEGER DEFAULT 1 NOT NULL,
        "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
        "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
        "deleted_at" TIMESTAMPTZ,
        CONSTRAINT "chk_dle_distinct_parties" CHECK ("from_user_id" <> "to_user_id"),
        CONSTRAINT "chk_dle_amount_positive" CHECK ("amount" > 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_dle_from" ON "direct_ledger_entries" ("from_user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_dle_to" ON "direct_ledger_entries" ("to_user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_dle_occurred" ON "direct_ledger_entries" ("occurred_on")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "direct_ledger_entries"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "expense_payments"`);
  }
}
