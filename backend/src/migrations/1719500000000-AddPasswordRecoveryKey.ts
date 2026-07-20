import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPasswordRecoveryKey1719500000000 implements MigrationInterface {
  name = 'AddPasswordRecoveryKey1719500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "recovery_wrapped_key" text NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "recovery_key_created_at" timestamptz NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "recovery_key_created_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "recovery_wrapped_key"
    `);
  }
}
