import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChangeTitlesToText1718700000000 implements MigrationInterface {
  name = 'ChangeTitlesToText1718700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "expenses" ALTER COLUMN "title" TYPE TEXT`);
    await queryRunner.query(`ALTER TABLE "recurring_expenses" ALTER COLUMN "title" TYPE TEXT`);
    await queryRunner.query(`ALTER TABLE "notes" ALTER COLUMN "title" TYPE TEXT`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "expenses" ALTER COLUMN "title" TYPE VARCHAR(160)`);
    await queryRunner.query(`ALTER TABLE "recurring_expenses" ALTER COLUMN "title" TYPE VARCHAR(160)`);
    await queryRunner.query(`ALTER TABLE "notes" ALTER COLUMN "title" TYPE VARCHAR(160)`);
  }
}
