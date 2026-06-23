import { MigrationInterface, QueryRunner } from 'typeorm';

export class RevertExpenseAmountsEncryption1718600000000 implements MigrationInterface {
  name = 'RevertExpenseAmountsEncryption1718600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Revert amount_total in expenses back to DECIMAL(12, 2)
    await queryRunner.query(`
      ALTER TABLE "expenses"
      ALTER COLUMN "amount_total" TYPE DECIMAL(12, 2) 
      USING (CASE WHEN "amount_total" ~ '^[0-9.-]+$' THEN "amount_total"::DECIMAL(12, 2) ELSE 0.00 END)
    `);

    // Revert amount_owed in expense_splits back to DECIMAL(12, 2)
    await queryRunner.query(`
      ALTER TABLE "expense_splits"
      ALTER COLUMN "amount_owed" TYPE DECIMAL(12, 2)
      USING (CASE WHEN "amount_owed" ~ '^[0-9.-]+$' THEN "amount_owed"::DECIMAL(12, 2) ELSE 0.00 END)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Alter amount_total in expenses back to VARCHAR(255)
    await queryRunner.query(`
      ALTER TABLE "expenses"
      ALTER COLUMN "amount_total" TYPE VARCHAR(255) USING "amount_total"::VARCHAR(255)
    `);

    // Alter amount_owed in expense_splits back to VARCHAR(255)
    await queryRunner.query(`
      ALTER TABLE "expense_splits"
      ALTER COLUMN "amount_owed" TYPE VARCHAR(255) USING "amount_owed"::VARCHAR(255)
    `);
  }
}
