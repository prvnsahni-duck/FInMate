import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRecurringExpenses1718500000000 implements MigrationInterface {
  name = 'AddRecurringExpenses1718500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create recurring_expenses table
    await queryRunner.query(`
      CREATE TABLE "recurring_expenses" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "title" VARCHAR(160) NOT NULL,
        "description" TEXT,
        "amount_total" DECIMAL(12, 2) NOT NULL,
        "currency" CHAR(3) NOT NULL,
        "category" VARCHAR(64) NOT NULL,
        "paid_by_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "owner_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "group_id" UUID REFERENCES "groups"("id") ON DELETE SET NULL,
        "frequency" VARCHAR(20) NOT NULL,
        "start_date" DATE NOT NULL,
        "end_date" DATE,
        "next_occurrence_date" DATE NOT NULL,
        "status" VARCHAR(20) DEFAULT 'active' NOT NULL,
        "version" INTEGER DEFAULT 1 NOT NULL,
        "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
        "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL
      )
    `);

    // 2. Create recurring_expense_splits table
    await queryRunner.query(`
      CREATE TABLE "recurring_expense_splits" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "recurring_expense_id" UUID NOT NULL REFERENCES "recurring_expenses"("id") ON DELETE CASCADE,
        "participant_user_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
        "participant_group_member_id" UUID REFERENCES "group_members"("id") ON DELETE SET NULL,
        "split_type" VARCHAR(20) NOT NULL,
        "share_value" DECIMAL(12, 4) NOT NULL,
        "amount_owed" DECIMAL(12, 2) NOT NULL,
        "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
        "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
        CONSTRAINT "chk_recurring_expense_splits_participant" CHECK (
          ("participant_user_id" IS NOT NULL AND "participant_group_member_id" IS NULL) OR
          ("participant_user_id" IS NULL AND "participant_group_member_id" IS NOT NULL)
        )
      )
    `);

    // 3. Create indices
    await queryRunner.query(`
      CREATE INDEX "idx_recurring_expenses_occurrence" ON "recurring_expenses" ("next_occurrence_date", "status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_recurring_expenses_occurrence"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "recurring_expense_splits"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "recurring_expenses"`);
  }
}
