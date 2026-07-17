import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExpenseSplitVersionAndSoftDelete1719300000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "expense_splits"
      ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE "expense_splits"
      ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "expense_splits" DROP COLUMN IF EXISTS "deleted_at";
    `);
    await queryRunner.query(`
      ALTER TABLE "expense_splits" DROP COLUMN IF EXISTS "version";
    `);
  }
}
