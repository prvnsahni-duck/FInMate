import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Extends `recurring_expenses` with the same dual-payer shape already applied
 * to `expenses`: `paid_by_user_id` becomes optional and a nullable
 * `paid_by_group_member_id` is added, so a group template's payer can be a
 * pending (Contact-backed) member. Additive only — existing rows keep
 * `paid_by_user_id` populated and remain valid under the new CHECK.
 */
export class AddRecurringExpenseGroupMemberPayer1719700000000
  implements MigrationInterface
{
  name = 'AddRecurringExpenseGroupMemberPayer1719700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "recurring_expenses" ALTER COLUMN "paid_by_user_id" DROP NOT NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE "recurring_expenses" ADD COLUMN "paid_by_group_member_id" uuid;
    `);
    await queryRunner.query(`
      ALTER TABLE "recurring_expenses"
      ADD CONSTRAINT "FK_recurring_expenses_paid_by_group_member" FOREIGN KEY ("paid_by_group_member_id")
        REFERENCES "group_members"("id") ON DELETE RESTRICT;
    `);
    await queryRunner.query(`
      ALTER TABLE "recurring_expenses"
      ADD CONSTRAINT "CHK_recurring_expenses_payer" CHECK (
        (("paid_by_user_id" IS NOT NULL) <> ("paid_by_group_member_id" IS NOT NULL))
        AND ("group_id" IS NOT NULL OR "paid_by_group_member_id" IS NULL)
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "recurring_expenses" DROP CONSTRAINT IF EXISTS "CHK_recurring_expenses_payer";`,
    );
    await queryRunner.query(
      `ALTER TABLE "recurring_expenses" DROP CONSTRAINT IF EXISTS "FK_recurring_expenses_paid_by_group_member";`,
    );
    await queryRunner.query(
      `ALTER TABLE "recurring_expenses" DROP COLUMN IF EXISTS "paid_by_group_member_id";`,
    );
    await queryRunner.query(
      `ALTER TABLE "recurring_expenses" ALTER COLUMN "paid_by_user_id" SET NOT NULL;`,
    );
  }
}
