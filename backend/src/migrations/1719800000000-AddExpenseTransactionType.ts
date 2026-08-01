import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `transaction_type` to expenses so the group ledger can record refunds
 * (money returning to the group) alongside normal expenses. Existing rows
 * backfill to 'expense', preserving all current behaviour.
 */
export class AddExpenseTransactionType1719800000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "expenses"
      ADD COLUMN IF NOT EXISTS "transaction_type" VARCHAR(20) NOT NULL DEFAULT 'expense'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "expenses" DROP COLUMN IF EXISTS "transaction_type"
    `);
  }
}
