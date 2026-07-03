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
  Settlement,
  Note,
  Goal,
  Attachment,
  AuditLog,
  RecurringExpense,
  RecurringExpenseSplit,
  GroupInvite,
  EncryptedGroupKey,
} from '@finmate/data-models';
import * as Migrations from './migrations';
import { SnakeNamingStrategy } from './app/common/snake-naming-strategy';

dotenv.config({ path: '.env' });
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: '.env.dev' });
}

const sslEnabled = process.env.DB_SSL === 'true';
const sslRejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';
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
    RecurringExpense,
    RecurringExpenseSplit,
    Settlement,
    Note,
    Goal,
    Attachment,
    AuditLog,
    GroupInvite,
    EncryptedGroupKey,
  ],
  migrations: [...Object.values(Migrations)],
  namingStrategy: new SnakeNamingStrategy(),
  synchronize: false,
});
