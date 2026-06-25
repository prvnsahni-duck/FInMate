import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: AddGroupTypeAndSpectatorAndHousehold
 *
 * Changes:
 * 1. groups — add `group_type` (normal | household) and `carry_forward_enabled`.
 * 2. group_members — extend `role` column to accept 'spectator' (stored as varchar, no enum type).
 *    The role column is varchar(20) so no ALTER TYPE is needed.
 * 3. expenses — add `ledger_month` (CHAR(7), nullable) and `is_carry_forward` (boolean).
 * 4. expenses — add composite index on (group_id, ledger_month).
 */
export class AddGroupTypeAndSpectatorAndHousehold1718200000000
  implements MigrationInterface
{
  name = 'AddGroupTypeAndSpectatorAndHousehold1718200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── groups ──────────────────────────────────────────────────────────────

    // Add group_type column (normal | household)
    await queryRunner.query(`
      ALTER TABLE "groups"
      ADD COLUMN IF NOT EXISTS "group_type" VARCHAR(20) NOT NULL DEFAULT 'normal'
    `);

    // Add carry_forward_enabled (household groups only; ignored for normal)
    await queryRunner.query(`
      ALTER TABLE "groups"
      ADD COLUMN IF NOT EXISTS "carry_forward_enabled" BOOLEAN NOT NULL DEFAULT false
    `);

    // ── group_members ────────────────────────────────────────────────────────
    // role is already stored as VARCHAR(20), so no type change is required.
    // TypeORM will pick up 'spectator' as a valid value via the entity union type.
    // No DDL change needed for the column itself.

    // ── expenses ─────────────────────────────────────────────────────────────

    // Add ledger_month for household expense tracking (format: YYYY-MM)
    await queryRunner.query(`
      ALTER TABLE "expenses"
      ADD COLUMN IF NOT EXISTS "ledger_month" CHAR(7) NULL
    `);

    // Add is_carry_forward flag for system-generated carry-forward records
    await queryRunner.query(`
      ALTER TABLE "expenses"
      ADD COLUMN IF NOT EXISTS "is_carry_forward" BOOLEAN NOT NULL DEFAULT false
    `);

    // Add composite index on (group_id, ledger_month) for household queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_expenses_group_ledger_month"
      ON "expenses" ("group_id", "ledger_month")
      WHERE "ledger_month" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop index
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_expenses_group_ledger_month"`,
    );

    // Revert expenses columns
    await queryRunner.query(
      `ALTER TABLE "expenses" DROP COLUMN IF EXISTS "is_carry_forward"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expenses" DROP COLUMN IF EXISTS "ledger_month"`,
    );

    // Revert groups columns
    await queryRunner.query(
      `ALTER TABLE "groups" DROP COLUMN IF EXISTS "carry_forward_enabled"`,
    );
    await queryRunner.query(
      `ALTER TABLE "groups" DROP COLUMN IF EXISTS "group_type"`,
    );
  }
}
