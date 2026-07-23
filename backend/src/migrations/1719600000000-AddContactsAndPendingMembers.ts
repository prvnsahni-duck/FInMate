import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pending Members: adds the `contacts` table and additive, nullable
 * alternate-identity columns to group_members/expenses/settlements/
 * group_invites, plus users.email_verified. Purely additive — no existing
 * column is dropped, no data is rewritten except the one-time
 * email_verified backfill for pre-existing users. Zero downtime.
 */
export class AddContactsAndPendingMembers1719600000000
  implements MigrationInterface
{
  name = 'AddContactsAndPendingMembers1719600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. contacts table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "contacts" (
        "id" uuid DEFAULT gen_random_uuid() NOT NULL,
        "email" varchar(255),
        "phone_number" varchar(20),
        "display_name" varchar(120),
        "status" varchar(20) DEFAULT 'pending' NOT NULL,
        "created_by_user_id" uuid NOT NULL,
        "claimed_by_user_id" uuid,
        "claimed_at" timestamptz,
        "merged_into_contact_id" uuid,
        "merged_at" timestamptz,
        "merged_by_user_id" uuid,
        "created_at" timestamptz DEFAULT now() NOT NULL,
        "updated_at" timestamptz DEFAULT now() NOT NULL,
        CONSTRAINT "PK_contacts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_contacts_created_by_user" FOREIGN KEY ("created_by_user_id")
          REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_contacts_claimed_by_user" FOREIGN KEY ("claimed_by_user_id")
          REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_contacts_merged_by_user" FOREIGN KEY ("merged_by_user_id")
          REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_contacts_merged_into_contact" FOREIGN KEY ("merged_into_contact_id")
          REFERENCES "contacts"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_contacts_has_identifier" CHECK ("email" IS NOT NULL OR "phone_number" IS NOT NULL)
      );
    `);
    // Uniqueness only needs to hold among currently-pending, actionable
    // contacts — mirrors ContactsService.resolveOrCreateIdentity's own dedup
    // filter (status = 'pending') exactly, so claimed/archived history never
    // blocks a future row.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_contacts_pending_email"
      ON "contacts" ("email") WHERE "status" = 'pending' AND "email" IS NOT NULL;
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_contacts_pending_phone"
      ON "contacts" ("phone_number") WHERE "status" = 'pending' AND "phone_number" IS NOT NULL;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_contacts_created_by_user"
      ON "contacts" ("created_by_user_id");
    `);

    // 2. group_members: user_id becomes optional, contact_id added
    await queryRunner.query(`
      ALTER TABLE "group_members" ALTER COLUMN "user_id" DROP NOT NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE "group_members" ADD COLUMN "contact_id" uuid;
    `);
    await queryRunner.query(`
      ALTER TABLE "group_members" ADD COLUMN "nickname" varchar(120);
    `);
    await queryRunner.query(`
      ALTER TABLE "group_members"
      ADD CONSTRAINT "FK_group_members_contact" FOREIGN KEY ("contact_id")
        REFERENCES "contacts"("id") ON DELETE SET NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE "group_members"
      ADD CONSTRAINT "CHK_group_members_identity"
        CHECK ("user_id" IS NOT NULL OR "contact_id" IS NOT NULL);
    `);
    await queryRunner.query(`
      ALTER TABLE "group_members"
      ADD CONSTRAINT "UQ_group_members_group_contact" UNIQUE ("group_id", "contact_id");
    `);

    // 3. expenses: paid_by_user_id becomes optional, paid_by_group_member_id added
    await queryRunner.query(`
      ALTER TABLE "expenses" ALTER COLUMN "paid_by_user_id" DROP NOT NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE "expenses" ADD COLUMN "paid_by_group_member_id" uuid;
    `);
    await queryRunner.query(`
      ALTER TABLE "expenses"
      ADD CONSTRAINT "FK_expenses_paid_by_group_member" FOREIGN KEY ("paid_by_group_member_id")
        REFERENCES "group_members"("id") ON DELETE RESTRICT;
    `);
    await queryRunner.query(`
      ALTER TABLE "expenses"
      ADD CONSTRAINT "CHK_expenses_payer" CHECK (
        (("paid_by_user_id" IS NOT NULL) <> ("paid_by_group_member_id" IS NOT NULL))
        AND ("group_id" IS NOT NULL OR "paid_by_group_member_id" IS NULL)
      );
    `);

    // 4. settlements: from/to user_id become optional, group_member_id columns added
    await queryRunner.query(`
      ALTER TABLE "settlements" ALTER COLUMN "from_user_id" DROP NOT NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE "settlements" ALTER COLUMN "to_user_id" DROP NOT NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE "settlements" ADD COLUMN "from_group_member_id" uuid;
    `);
    await queryRunner.query(`
      ALTER TABLE "settlements" ADD COLUMN "to_group_member_id" uuid;
    `);
    await queryRunner.query(`
      ALTER TABLE "settlements"
      ADD CONSTRAINT "FK_settlements_from_group_member" FOREIGN KEY ("from_group_member_id")
        REFERENCES "group_members"("id") ON DELETE RESTRICT;
    `);
    await queryRunner.query(`
      ALTER TABLE "settlements"
      ADD CONSTRAINT "FK_settlements_to_group_member" FOREIGN KEY ("to_group_member_id")
        REFERENCES "group_members"("id") ON DELETE RESTRICT;
    `);
    await queryRunner.query(`
      ALTER TABLE "settlements"
      ADD CONSTRAINT "CHK_settlements_parties" CHECK (
        (("from_user_id" IS NOT NULL) <> ("from_group_member_id" IS NOT NULL))
        AND (("to_user_id" IS NOT NULL) <> ("to_group_member_id" IS NOT NULL))
      );
    `);

    // 5. group_invites: contact_id added (invitee may not be a registered User yet)
    await queryRunner.query(`
      ALTER TABLE "group_invites" ADD COLUMN "contact_id" uuid;
    `);
    await queryRunner.query(`
      ALTER TABLE "group_invites"
      ADD CONSTRAINT "FK_group_invites_contact" FOREIGN KEY ("contact_id")
        REFERENCES "contacts"("id") ON DELETE SET NULL;
    `);

    // 6. users: email_verified — gates Contact-claiming only, never login.
    // Pre-existing users are backfilled to true so this ships with zero
    // behavior change for anyone who registered before this migration;
    // only new registrations start unverified.
    await queryRunner.query(`
      ALTER TABLE "users" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;
    `);
    await queryRunner.query(`
      UPDATE "users" SET "email_verified" = true;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "email_verified";`,
    );

    await queryRunner.query(
      `ALTER TABLE "group_invites" DROP CONSTRAINT IF EXISTS "FK_group_invites_contact";`,
    );
    await queryRunner.query(
      `ALTER TABLE "group_invites" DROP COLUMN IF EXISTS "contact_id";`,
    );

    await queryRunner.query(
      `ALTER TABLE "settlements" DROP CONSTRAINT IF EXISTS "CHK_settlements_parties";`,
    );
    await queryRunner.query(
      `ALTER TABLE "settlements" DROP CONSTRAINT IF EXISTS "FK_settlements_to_group_member";`,
    );
    await queryRunner.query(
      `ALTER TABLE "settlements" DROP CONSTRAINT IF EXISTS "FK_settlements_from_group_member";`,
    );
    await queryRunner.query(
      `ALTER TABLE "settlements" DROP COLUMN IF EXISTS "to_group_member_id";`,
    );
    await queryRunner.query(
      `ALTER TABLE "settlements" DROP COLUMN IF EXISTS "from_group_member_id";`,
    );
    await queryRunner.query(
      `ALTER TABLE "settlements" ALTER COLUMN "to_user_id" SET NOT NULL;`,
    );
    await queryRunner.query(
      `ALTER TABLE "settlements" ALTER COLUMN "from_user_id" SET NOT NULL;`,
    );

    await queryRunner.query(
      `ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "CHK_expenses_payer";`,
    );
    await queryRunner.query(
      `ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "FK_expenses_paid_by_group_member";`,
    );
    await queryRunner.query(
      `ALTER TABLE "expenses" DROP COLUMN IF EXISTS "paid_by_group_member_id";`,
    );
    await queryRunner.query(
      `ALTER TABLE "expenses" ALTER COLUMN "paid_by_user_id" SET NOT NULL;`,
    );

    await queryRunner.query(
      `ALTER TABLE "group_members" DROP CONSTRAINT IF EXISTS "UQ_group_members_group_contact";`,
    );
    await queryRunner.query(
      `ALTER TABLE "group_members" DROP CONSTRAINT IF EXISTS "CHK_group_members_identity";`,
    );
    await queryRunner.query(
      `ALTER TABLE "group_members" DROP CONSTRAINT IF EXISTS "FK_group_members_contact";`,
    );
    await queryRunner.query(
      `ALTER TABLE "group_members" DROP COLUMN IF EXISTS "nickname";`,
    );
    await queryRunner.query(
      `ALTER TABLE "group_members" DROP COLUMN IF EXISTS "contact_id";`,
    );
    await queryRunner.query(
      `ALTER TABLE "group_members" ALTER COLUMN "user_id" SET NOT NULL;`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_contacts_created_by_user";`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_contacts_pending_phone";`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_contacts_pending_email";`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "contacts";`);
  }
}
