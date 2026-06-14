import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGroupCurrencyAndExpenseSoftDelete1718100000000 implements MigrationInterface {
  name = 'AddGroupCurrencyAndExpenseSoftDelete1718100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "groups"
      ADD COLUMN IF NOT EXISTS "currency" CHAR(3) DEFAULT 'USD' NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "expenses"
      ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "groups"
      DROP COLUMN "currency"
    `);
    await queryRunner.query(`
      ALTER TABLE "expenses"
      DROP COLUMN "deleted_at"
    `);
  }
}
