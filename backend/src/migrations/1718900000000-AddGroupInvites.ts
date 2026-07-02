import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGroupInvites1718900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "group_invites" (
        "id"                uuid DEFAULT gen_random_uuid() NOT NULL,
        "group_id"          uuid NOT NULL,
        "invite_token"      uuid DEFAULT gen_random_uuid() NOT NULL,
        "invited_email"     varchar(255),
        "invitee_user_id"   uuid,
        "wrapped_group_key" text,
        "status"            varchar(20) DEFAULT 'pending' NOT NULL,
        "created_at"        timestamptz DEFAULT now() NOT NULL,
        "expires_at"        timestamptz,
        CONSTRAINT "PK_group_invites" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_group_invites_token" UNIQUE ("invite_token"),
        CONSTRAINT "FK_group_invites_group" FOREIGN KEY ("group_id")
          REFERENCES "groups"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_group_invites_invitee" FOREIGN KEY ("invitee_user_id")
          REFERENCES "users"("id") ON DELETE SET NULL
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "group_invites";`);
  }
}
