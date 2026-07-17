import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRecurringExpenseKeyVersion1719200000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "recurring_expenses"
      ADD COLUMN IF NOT EXISTS "group_key_version_id" uuid;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_recurring_expenses_group_key_version'
        ) THEN
          ALTER TABLE "recurring_expenses"
          ADD CONSTRAINT "FK_recurring_expenses_group_key_version"
          FOREIGN KEY ("group_key_version_id") REFERENCES "group_key_versions"("id")
          ON DELETE SET NULL;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "recurring_expenses"
      DROP CONSTRAINT IF EXISTS "FK_recurring_expenses_group_key_version";
    `);
    await queryRunner.query(`
      ALTER TABLE "recurring_expenses" DROP COLUMN IF EXISTS "group_key_version_id";
    `);
  }
}
