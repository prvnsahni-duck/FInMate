import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1717977600000 implements MigrationInterface {
  name = 'InitialSchema1717977600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable uuid-ossp extension if not exists
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // 1. users table
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "email" VARCHAR(255) UNIQUE NOT NULL,
        "password_hash" VARCHAR(255) NOT NULL,
        "display_name" VARCHAR(120),
        "status" VARCHAR(20) DEFAULT 'active' NOT NULL,
        "last_login_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
        "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL
      )
    `);

    // 2. profiles table
    await queryRunner.query(`
      CREATE TABLE "profiles" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "user_id" UUID UNIQUE NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "avatar_url" TEXT,
        "locale" VARCHAR(10) DEFAULT 'en-IN' NOT NULL,
        "timezone" VARCHAR(64) DEFAULT 'Asia/Kolkata' NOT NULL,
        "default_currency" CHAR(3) NOT NULL,
        "monthly_budget" DECIMAL(12, 2),
        "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
        "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL
      )
    `);

    // 3. groups table
    await queryRunner.query(`
      CREATE TABLE "groups" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "name" VARCHAR(120) NOT NULL,
        "description" TEXT,
        "visibility" VARCHAR(24) DEFAULT 'private' NOT NULL,
        "owner_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "is_archived" BOOLEAN DEFAULT false NOT NULL,
        "version" INTEGER DEFAULT 1 NOT NULL,
        "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
        "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL
      )
    `);

    // 4. group_members table
    await queryRunner.query(`
      CREATE TABLE "group_members" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "group_id" UUID NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
        "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "role" VARCHAR(20) NOT NULL,
        "join_status" VARCHAR(20) NOT NULL,
        "joined_at" TIMESTAMPTZ,
        "left_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
        "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
        CONSTRAINT "uq_group_members_group_user" UNIQUE ("group_id", "user_id")
      )
    `);

    // 5. expenses table
    await queryRunner.query(`
      CREATE TABLE "expenses" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "title" VARCHAR(160) NOT NULL,
        "description" TEXT,
        "amount_total" DECIMAL(12, 2) NOT NULL,
        "currency" CHAR(3) NOT NULL,
        "category" VARCHAR(64) NOT NULL,
        "paid_by_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "owner_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "group_id" UUID REFERENCES "groups"("id") ON DELETE SET NULL,
        "expense_date" DATE NOT NULL,
        "status" VARCHAR(20) DEFAULT 'posted' NOT NULL,
        "version" INTEGER DEFAULT 1 NOT NULL,
        "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
        "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL
      )
    `);

    // 6. expense_splits table
    await queryRunner.query(`
      CREATE TABLE "expense_splits" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "expense_id" UUID NOT NULL REFERENCES "expenses"("id") ON DELETE CASCADE,
        "participant_user_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
        "participant_group_member_id" UUID REFERENCES "group_members"("id") ON DELETE SET NULL,
        "split_type" VARCHAR(20) NOT NULL,
        "share_value" DECIMAL(12, 4) NOT NULL,
        "amount_owed" DECIMAL(12, 2) NOT NULL,
        "is_settled" BOOLEAN DEFAULT false NOT NULL,
        "settled_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
        "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
        CONSTRAINT "chk_expense_splits_participant" CHECK (
          ("participant_user_id" IS NOT NULL AND "participant_group_member_id" IS NULL) OR
          ("participant_user_id" IS NULL AND "participant_group_member_id" IS NOT NULL)
        )
      )
    `);

    // 7. settlements table
    await queryRunner.query(`
      CREATE TABLE "settlements" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "group_id" UUID NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
        "from_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "to_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "amount" DECIMAL(12, 2) NOT NULL,
        "currency" CHAR(3) NOT NULL,
        "status" VARCHAR(20) DEFAULT 'proposed' NOT NULL,
        "settled_on" DATE,
        "note" TEXT,
        "version" INTEGER DEFAULT 1 NOT NULL,
        "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
        "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL
      )
    `);

    // 8. notes table
    await queryRunner.query(`
      CREATE TABLE "notes" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "author_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "group_id" UUID REFERENCES "groups"("id") ON DELETE SET NULL,
        "title" VARCHAR(160) NOT NULL,
        "body" TEXT NOT NULL,
        "visibility" VARCHAR(20) NOT NULL,
        "version" INTEGER DEFAULT 1 NOT NULL,
        "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
        "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL
      )
    `);

    // 9. goals table
    await queryRunner.query(`
      CREATE TABLE "goals" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "owner_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "title" VARCHAR(160) NOT NULL,
        "target_amount" DECIMAL(12, 2) NOT NULL,
        "saved_amount" DECIMAL(12, 2) DEFAULT 0 NOT NULL,
        "currency" CHAR(3) NOT NULL,
        "target_date" DATE,
        "status" VARCHAR(20) DEFAULT 'active' NOT NULL,
        "version" INTEGER DEFAULT 1 NOT NULL,
        "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
        "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL
      )
    `);

    // 10. attachments table
    await queryRunner.query(`
      CREATE TABLE "attachments" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "uploader_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "expense_id" UUID REFERENCES "expenses"("id") ON DELETE CASCADE,
        "note_id" UUID REFERENCES "notes"("id") ON DELETE CASCADE,
        "goal_id" UUID REFERENCES "goals"("id") ON DELETE CASCADE,
        "group_id" UUID REFERENCES "groups"("id") ON DELETE CASCADE,
        "storage_key" TEXT NOT NULL,
        "original_name" VARCHAR(255) NOT NULL,
        "mime_type" VARCHAR(128) NOT NULL,
        "size_bytes" BIGINT NOT NULL,
        "checksum_sha256" CHAR(64),
        "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
        CONSTRAINT "chk_attachments_parent" CHECK (
          "expense_id" IS NOT NULL OR
          "note_id" IS NOT NULL OR
          "goal_id" IS NOT NULL OR
          "group_id" IS NOT NULL
        )
      )
    `);

    // 11. audit_logs table
    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "actor_user_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
        "action" VARCHAR(80) NOT NULL,
        "entity_type" VARCHAR(80) NOT NULL,
        "entity_id" UUID NOT NULL,
        "scope" VARCHAR(20) NOT NULL,
        "group_id" UUID REFERENCES "groups"("id") ON DELETE SET NULL,
        "request_id" VARCHAR(64),
        "ip_hash" VARCHAR(128),
        "metadata_json" JSONB,
        "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "attachments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "goals"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "settlements"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "expense_splits"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "expenses"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "group_members"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "groups"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "profiles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
