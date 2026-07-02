import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: AddEnvelopeEncryption
 *
 * Creates the `encrypted_group_keys` and `encrypted_expense_keys` tables
 * for envelope encryption key wrapping. Adds `encryption_scope` to expenses
 * and `encrypted_file_key` / `encrypted_original_name` to attachments.
 */
export class AddEnvelopeEncryption1718800000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── encrypted_group_keys ────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "encrypted_group_keys" (
        "id"          uuid DEFAULT gen_random_uuid() NOT NULL,
        "group_id"    uuid NOT NULL,
        "user_id"     uuid NOT NULL,
        "wrapped_key" text NOT NULL,
        "created_at"  timestamptz DEFAULT now() NOT NULL,
        "updated_at"  timestamptz DEFAULT now() NOT NULL,
        CONSTRAINT "PK_encrypted_group_keys" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_encrypted_group_keys_group_user" UNIQUE ("group_id", "user_id"),
        CONSTRAINT "FK_encrypted_group_keys_group" FOREIGN KEY ("group_id")
          REFERENCES "groups"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_encrypted_group_keys_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);

    // ── encrypted_expense_keys ──────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "encrypted_expense_keys" (
        "id"          uuid DEFAULT gen_random_uuid() NOT NULL,
        "expense_id"  uuid NOT NULL,
        "user_id"     uuid NOT NULL,
        "wrapped_key" text NOT NULL,
        "created_at"  timestamptz DEFAULT now() NOT NULL,
        CONSTRAINT "PK_encrypted_expense_keys" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_encrypted_expense_keys_expense_user" UNIQUE ("expense_id", "user_id"),
        CONSTRAINT "FK_encrypted_expense_keys_expense" FOREIGN KEY ("expense_id")
          REFERENCES "expenses"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_encrypted_expense_keys_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);

    // ── expenses.encryption_scope ───────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "expenses"
        ADD COLUMN IF NOT EXISTS "encryption_scope" varchar(20) DEFAULT 'personal' NOT NULL;
    `);

    // ── attachments: encryption columns ─────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "attachments"
        ADD COLUMN IF NOT EXISTS "encrypted_file_key" text,
        ADD COLUMN IF NOT EXISTS "encrypted_original_name" text;
    `);

    // ── users: public key and encrypted private key columns ─────────────
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "public_wrapping_key" text,
        ADD COLUMN IF NOT EXISTS "encrypted_private_wrapping_key" text;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN IF EXISTS "encrypted_private_wrapping_key",
        DROP COLUMN IF EXISTS "public_wrapping_key";
    `);

    await queryRunner.query(`
      ALTER TABLE "attachments"
        DROP COLUMN IF EXISTS "encrypted_original_name",
        DROP COLUMN IF EXISTS "encrypted_file_key";
    `);

    await queryRunner.query(`
      ALTER TABLE "expenses"
        DROP COLUMN IF EXISTS "encryption_scope";
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "encrypted_expense_keys";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "encrypted_group_keys";`);
  }
}
