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
} from '@finmate/data-models';
import * as Migrations from './migrations';
import { SnakeNamingStrategy } from './app/common/snake-naming-strategy';

dotenv.config({ path: '.env' });
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: '.env.dev' });
}

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [
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
  ],
  migrations: [...Object.values(Migrations)],
  namingStrategy: new SnakeNamingStrategy(),
  synchronize: false,
});
