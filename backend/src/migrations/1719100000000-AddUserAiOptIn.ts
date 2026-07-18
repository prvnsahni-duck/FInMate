import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserAiOptIn1719100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "ai_opt_in" boolean DEFAULT false NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "ai_opt_in";
    `);
  }
}
