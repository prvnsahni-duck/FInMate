import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExpenseVersionHistory1719400000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "expense_versions" (
        "id" uuid DEFAULT gen_random_uuid() NOT NULL,
        "expense_id" uuid NOT NULL,
        "entity_version" integer NOT NULL,
        "action" varchar(32) NOT NULL,
        "snapshot" jsonb NOT NULL,
        "actor_user_id" uuid,
        "created_at" timestamptz DEFAULT now() NOT NULL,
        CONSTRAINT "PK_expense_versions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_expense_versions_expense" FOREIGN KEY ("expense_id")
          REFERENCES "expenses"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_expense_versions_actor_user" FOREIGN KEY ("actor_user_id")
          REFERENCES "users"("id") ON DELETE SET NULL
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_expense_versions_expense_version"
      ON "expense_versions" ("expense_id", "entity_version");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "expense_split_versions" (
        "id" uuid DEFAULT gen_random_uuid() NOT NULL,
        "expense_id" uuid NOT NULL,
        "expense_split_id" uuid,
        "entity_version" integer,
        "action" varchar(32) NOT NULL,
        "snapshot" jsonb NOT NULL,
        "actor_user_id" uuid,
        "created_at" timestamptz DEFAULT now() NOT NULL,
        CONSTRAINT "PK_expense_split_versions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_expense_split_versions_expense" FOREIGN KEY ("expense_id")
          REFERENCES "expenses"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_expense_split_versions_split" FOREIGN KEY ("expense_split_id")
          REFERENCES "expense_splits"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_expense_split_versions_actor_user" FOREIGN KEY ("actor_user_id")
          REFERENCES "users"("id") ON DELETE SET NULL
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_expense_split_versions_expense_created"
      ON "expense_split_versions" ("expense_id", "created_at");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_expense_split_versions_split_version"
      ON "expense_split_versions" ("expense_split_id", "entity_version");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "settlement_versions" (
        "id" uuid DEFAULT gen_random_uuid() NOT NULL,
        "settlement_id" uuid NOT NULL,
        "entity_version" integer NOT NULL,
        "action" varchar(32) NOT NULL,
        "snapshot" jsonb NOT NULL,
        "actor_user_id" uuid,
        "created_at" timestamptz DEFAULT now() NOT NULL,
        CONSTRAINT "PK_settlement_versions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_settlement_versions_settlement" FOREIGN KEY ("settlement_id")
          REFERENCES "settlements"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_settlement_versions_actor_user" FOREIGN KEY ("actor_user_id")
          REFERENCES "users"("id") ON DELETE SET NULL
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_settlement_versions_settlement_version"
      ON "settlement_versions" ("settlement_id", "entity_version");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "attachment_versions" (
        "id" uuid DEFAULT gen_random_uuid() NOT NULL,
        "attachment_id" uuid,
        "expense_id" uuid,
        "action" varchar(32) NOT NULL,
        "snapshot" jsonb NOT NULL,
        "actor_user_id" uuid,
        "created_at" timestamptz DEFAULT now() NOT NULL,
        CONSTRAINT "PK_attachment_versions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_attachment_versions_attachment" FOREIGN KEY ("attachment_id")
          REFERENCES "attachments"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_attachment_versions_expense" FOREIGN KEY ("expense_id")
          REFERENCES "expenses"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_attachment_versions_actor_user" FOREIGN KEY ("actor_user_id")
          REFERENCES "users"("id") ON DELETE SET NULL
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_attachment_versions_attachment_created"
      ON "attachment_versions" ("attachment_id", "created_at");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_attachment_versions_expense_created"
      ON "attachment_versions" ("expense_id", "created_at");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "receipt_versions" (
        "id" uuid DEFAULT gen_random_uuid() NOT NULL,
        "receipt_attachment_id" uuid,
        "expense_id" uuid,
        "action" varchar(32) NOT NULL,
        "snapshot" jsonb NOT NULL,
        "actor_user_id" uuid,
        "created_at" timestamptz DEFAULT now() NOT NULL,
        CONSTRAINT "PK_receipt_versions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_receipt_versions_attachment" FOREIGN KEY ("receipt_attachment_id")
          REFERENCES "attachments"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_receipt_versions_expense" FOREIGN KEY ("expense_id")
          REFERENCES "expenses"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_receipt_versions_actor_user" FOREIGN KEY ("actor_user_id")
          REFERENCES "users"("id") ON DELETE SET NULL
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_receipt_versions_attachment_created"
      ON "receipt_versions" ("receipt_attachment_id", "created_at");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_receipt_versions_expense_created"
      ON "receipt_versions" ("expense_id", "created_at");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_receipt_versions_expense_created";`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_receipt_versions_attachment_created";`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "receipt_versions";`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_attachment_versions_expense_created";`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_attachment_versions_attachment_created";`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "attachment_versions";`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_settlement_versions_settlement_version";`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "settlement_versions";`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_expense_split_versions_split_version";`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_expense_split_versions_expense_created";`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "expense_split_versions";`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_expense_versions_expense_version";`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "expense_versions";`);
  }
}
