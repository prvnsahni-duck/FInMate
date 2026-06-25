import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserPhoneAndGroupInviteToken1718400000000
  implements MigrationInterface
{
  name = 'AddUserPhoneAndGroupInviteToken1718400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add columns to users table
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "username" VARCHAR(50)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "phone_number" VARCHAR(20)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "UQ_users_username" UNIQUE ("username")`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "UQ_users_phone_number" UNIQUE ("phone_number")`,
    );

    // Add column to groups table
    await queryRunner.query(
      `ALTER TABLE "groups" ADD COLUMN "invite_token" UUID`,
    );
    await queryRunner.query(
      `ALTER TABLE "groups" ADD CONSTRAINT "UQ_groups_invite_token" UNIQUE ("invite_token")`,
    );

    // Add column to profiles table
    await queryRunner.query(
      `ALTER TABLE "profiles" ADD COLUMN "monthly_income" DECIMAL(12,2)`,
    );

    // Create group_member_contributions table
    await queryRunner.query(`
      CREATE TABLE "group_member_contributions" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "group_member_id" UUID NOT NULL,
        "ledger_month" CHAR(7) NOT NULL,
        "percentage" DECIMAL(5,2) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_group_member_contribution_month" UNIQUE ("group_member_id", "ledger_month"),
        CONSTRAINT "FK_group_member_contributions_group_member" FOREIGN KEY ("group_member_id") REFERENCES "group_members"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop table group_member_contributions
    await queryRunner.query(`DROP TABLE "group_member_contributions"`);

    // Drop columns from profiles table
    await queryRunner.query(
      `ALTER TABLE "profiles" DROP COLUMN "monthly_income"`,
    );

    // Drop columns from groups table
    await queryRunner.query(
      `ALTER TABLE "groups" DROP CONSTRAINT "UQ_groups_invite_token"`,
    );
    await queryRunner.query(`ALTER TABLE "groups" DROP COLUMN "invite_token"`);

    // Drop columns from users table
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "UQ_users_phone_number"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "UQ_users_username"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "phone_number"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "username"`);
  }
}
