import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTwoFactorAuth1718000000000 implements MigrationInterface {
  name = 'AddTwoFactorAuth1718000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "two_factor_secret" VARCHAR(255) NULL,
      ADD COLUMN "is_two_factor_enabled" BOOLEAN DEFAULT FALSE NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN "two_factor_secret",
      DROP COLUMN "is_two_factor_enabled"
    `);
  }
}
