import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import {
  User,
  Profile,
  Group,
  GroupMember,
  GroupMemberContribution,
  Expense,
  ExpenseSplit,
  ExpenseSplitVersion,
  ExpenseVersion,
  Settlement,
  SettlementVersion,
  Note,
  Goal,
  Attachment,
  AttachmentVersion,
  AuditLog,
  RecurringExpense,
  RecurringExpenseSplit,
  GroupInvite,
  EncryptedGroupKey,
  EncryptedExpenseKey,
  GroupKeyVersion,
  MemberWrappedGroupKey,
  ReceiptVersion,
} from '@finmate/data-models';
import * as Migrations from './migrations';
import { SnakeNamingStrategy } from './app/common/snake-naming-strategy';

dotenv.config({ path: '.env' });
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: '.env.dev' });
}

const sslEnabled = process.env.DB_SSL === 'true';
const sslRejectUnauthorized =
  process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';
const ssl = sslEnabled
  ? { rejectUnauthorized: sslRejectUnauthorized }
  : undefined;

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  ssl,
  entities: [
    User,
    Profile,
    Group,
    GroupMember,
    GroupMemberContribution,
    Expense,
    ExpenseSplit,
    ExpenseVersion,
    ExpenseSplitVersion,
    RecurringExpense,
    RecurringExpenseSplit,
    Settlement,
    SettlementVersion,
    Note,
    Goal,
    Attachment,
    AttachmentVersion,
    ReceiptVersion,
    AuditLog,
    GroupInvite,
    EncryptedGroupKey,
    EncryptedExpenseKey,
    GroupKeyVersion,
    MemberWrappedGroupKey,
  ],
  migrations: [...Object.values(Migrations)],
  namingStrategy: new SnakeNamingStrategy(),
  synchronize: false,
});
