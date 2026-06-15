import { MigrationInterface, QueryRunner } from 'typeorm';

export class EncryptExpenseAmounts1718300000000 implements MigrationInterface {
  name = 'EncryptExpenseAmounts1718300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Alter amount_total in expenses to VARCHAR(255)
    await queryRunner.query(`
      ALTER TABLE "expenses"
      ALTER COLUMN "amount_total" TYPE VARCHAR(255) USING "amount_total"::VARCHAR(255)
    `);

    // Alter amount_owed in expense_splits to VARCHAR(255)
    await queryRunner.query(`
      ALTER TABLE "expense_splits"
      ALTER COLUMN "amount_owed" TYPE VARCHAR(255) USING "amount_owed"::VARCHAR(255)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert amount_total in expenses back to DECIMAL(12, 2)
    // Using a regex check so that any encrypted values default to '0' rather than throwing cast errors
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
}
