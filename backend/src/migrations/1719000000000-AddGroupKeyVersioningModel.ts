import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGroupKeyVersioningModel1719000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "group_key_versions" (
        "id" uuid DEFAULT gen_random_uuid() NOT NULL,
        "group_id" uuid NOT NULL,
        "version" integer NOT NULL,
        "algorithm" varchar(64) DEFAULT 'AES-256-GCM' NOT NULL,
        "status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
        "created_at" timestamptz DEFAULT now() NOT NULL,
        "rotated_at" timestamptz,
        "rotated_by_user_id" uuid,
        "rotation_reason" varchar(255),
        CONSTRAINT "PK_group_key_versions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_group_key_versions_group_version" UNIQUE ("group_id", "version"),
        CONSTRAINT "FK_group_key_versions_group" FOREIGN KEY ("group_id")
          REFERENCES "groups"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_group_key_versions_rotated_by_user" FOREIGN KEY ("rotated_by_user_id")
          REFERENCES "users"("id") ON DELETE SET NULL
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_group_key_versions_one_active_per_group"
      ON "group_key_versions" ("group_id")
      WHERE "status" = 'ACTIVE';
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "member_wrapped_group_keys" (
        "id" uuid DEFAULT gen_random_uuid() NOT NULL,
        "group_key_version_id" uuid NOT NULL,
        "group_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "wrapped_group_key" text NOT NULL,
        "wrapping_algorithm" varchar(64),
        "public_key_fingerprint" varchar(255),
        "created_at" timestamptz DEFAULT now() NOT NULL,
        CONSTRAINT "PK_member_wrapped_group_keys" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_member_wrapped_group_keys_version_user" UNIQUE ("group_key_version_id", "user_id"),
        CONSTRAINT "FK_member_wrapped_group_keys_group_key_version" FOREIGN KEY ("group_key_version_id")
          REFERENCES "group_key_versions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_member_wrapped_group_keys_group" FOREIGN KEY ("group_id")
          REFERENCES "groups"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_member_wrapped_group_keys_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_member_wrapped_group_keys_group_id"
      ON "member_wrapped_group_keys" ("group_id");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_member_wrapped_group_keys_user_id"
      ON "member_wrapped_group_keys" ("user_id");
    `);

    await queryRunner.query(`
      ALTER TABLE "group_invites"
        ADD COLUMN IF NOT EXISTS "group_key_version_id" uuid;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_group_invites_group_key_version'
        ) THEN
          ALTER TABLE "group_invites"
            ADD CONSTRAINT "FK_group_invites_group_key_version" FOREIGN KEY ("group_key_version_id")
            REFERENCES "group_key_versions"("id") ON DELETE SET NULL;
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "expenses"
        ADD COLUMN IF NOT EXISTS "group_key_version_id" uuid;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_expenses_group_key_version'
        ) THEN
          ALTER TABLE "expenses"
            ADD CONSTRAINT "FK_expenses_group_key_version" FOREIGN KEY ("group_key_version_id")
            REFERENCES "group_key_versions"("id") ON DELETE SET NULL;
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_expenses_group_key_version_id"
      ON "expenses" ("group_key_version_id");
    `);

    await queryRunner.query(`
      ALTER TABLE "notes"
        ADD COLUMN IF NOT EXISTS "group_key_version_id" uuid;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_notes_group_key_version'
        ) THEN
          ALTER TABLE "notes"
            ADD CONSTRAINT "FK_notes_group_key_version" FOREIGN KEY ("group_key_version_id")
            REFERENCES "group_key_versions"("id") ON DELETE SET NULL;
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_notes_group_key_version_id"
      ON "notes" ("group_key_version_id");
    `);

    await queryRunner.query(`
      ALTER TABLE "attachments"
        ADD COLUMN IF NOT EXISTS "group_key_version_id" uuid;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_attachments_group_key_version'
        ) THEN
          ALTER TABLE "attachments"
            ADD CONSTRAINT "FK_attachments_group_key_version" FOREIGN KEY ("group_key_version_id")
            REFERENCES "group_key_versions"("id") ON DELETE SET NULL;
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_attachments_group_key_version_id"
      ON "attachments" ("group_key_version_id");
    `);

    // Backfill version-1 ACTIVE rows for groups that only have legacy encrypted_group_keys.
    await queryRunner.query(`
      INSERT INTO "group_key_versions" ("group_id", "version", "algorithm", "status")
      SELECT DISTINCT egk."group_id", 1, 'AES-256-GCM', 'ACTIVE'
      FROM "encrypted_group_keys" egk
      LEFT JOIN "group_key_versions" gkv
        ON gkv."group_id" = egk."group_id" AND gkv."status" = 'ACTIVE'
      WHERE gkv."id" IS NULL
      ON CONFLICT ("group_id", "version") DO NOTHING;
    `);

    // Backfill member wrapped keys from legacy encrypted_group_keys into ACTIVE key versions.
    await queryRunner.query(`
      INSERT INTO "member_wrapped_group_keys" (
        "group_key_version_id",
        "group_id",
        "user_id",
        "wrapped_group_key"
      )
      SELECT gkv."id", egk."group_id", egk."user_id", egk."wrapped_key"
      FROM "encrypted_group_keys" egk
      INNER JOIN "group_key_versions" gkv
        ON gkv."group_id" = egk."group_id" AND gkv."status" = 'ACTIVE'
      ON CONFLICT ("group_key_version_id", "user_id") DO NOTHING;
    `);

    // Stamp existing group-scoped encrypted resources with ACTIVE version where unset.
    await queryRunner.query(`
      UPDATE "expenses" e
      SET "group_key_version_id" = gkv."id"
      FROM "group_key_versions" gkv
      WHERE e."group_id" = gkv."group_id"
        AND gkv."status" = 'ACTIVE'
        AND e."group_id" IS NOT NULL
        AND e."group_key_version_id" IS NULL;
    `);

    await queryRunner.query(`
      UPDATE "notes" n
      SET "group_key_version_id" = gkv."id"
      FROM "group_key_versions" gkv
      WHERE n."group_id" = gkv."group_id"
        AND gkv."status" = 'ACTIVE'
        AND n."group_id" IS NOT NULL
        AND n."group_key_version_id" IS NULL;
    `);

    await queryRunner.query(`
      UPDATE "attachments" a
      SET "group_key_version_id" = gkv."id"
      FROM "group_key_versions" gkv
      WHERE a."group_id" = gkv."group_id"
        AND gkv."status" = 'ACTIVE'
        AND a."group_id" IS NOT NULL
        AND a."group_key_version_id" IS NULL;
    `);

    await queryRunner.query(`
      UPDATE "group_invites" gi
      SET "group_key_version_id" = gkv."id"
      FROM "group_key_versions" gkv
      WHERE gi."group_id" = gkv."group_id"
        AND gkv."status" = 'ACTIVE'
        AND gi."group_key_version_id" IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_attachments_group_key_version_id";`,
    );
    await queryRunner.query(
      `ALTER TABLE "attachments" DROP CONSTRAINT IF EXISTS "FK_attachments_group_key_version";`,
    );
    await queryRunner.query(
      `ALTER TABLE "attachments" DROP COLUMN IF EXISTS "group_key_version_id";`,
    );

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_notes_group_key_version_id";`);
    await queryRunner.query(
      `ALTER TABLE "notes" DROP CONSTRAINT IF EXISTS "FK_notes_group_key_version";`,
    );
    await queryRunner.query(
      `ALTER TABLE "notes" DROP COLUMN IF EXISTS "group_key_version_id";`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_expenses_group_key_version_id";`,
    );
    await queryRunner.query(
      `ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "FK_expenses_group_key_version";`,
    );
    await queryRunner.query(
      `ALTER TABLE "expenses" DROP COLUMN IF EXISTS "group_key_version_id";`,
    );

    await queryRunner.query(
      `ALTER TABLE "group_invites" DROP CONSTRAINT IF EXISTS "FK_group_invites_group_key_version";`,
    );
    await queryRunner.query(
      `ALTER TABLE "group_invites" DROP COLUMN IF EXISTS "group_key_version_id";`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_member_wrapped_group_keys_user_id";`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_member_wrapped_group_keys_group_id";`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "member_wrapped_group_keys";`);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_group_key_versions_one_active_per_group";`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "group_key_versions";`);
  }
}
