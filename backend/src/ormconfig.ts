import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { User } from '../../shared/data-models/src/lib/user.entity';
import { Profile } from '../../shared/data-models/src/lib/profile.entity';
import { Group } from '../../shared/data-models/src/lib/group.entity';
import { GroupMember } from '../../shared/data-models/src/lib/group-member.entity';
import { GroupMemberContribution } from '../../shared/data-models/src/lib/group-member-contribution.entity';
import { Expense } from '../../shared/data-models/src/lib/expense.entity';
import { ExpenseSplit } from '../../shared/data-models/src/lib/expense-split.entity';
import { Settlement } from '../../shared/data-models/src/lib/settlement.entity';
import { Note } from '../../shared/data-models/src/lib/note.entity';
import { Goal } from '../../shared/data-models/src/lib/goal.entity';
import { Attachment } from '../../shared/data-models/src/lib/attachment.entity';
import { AuditLog } from '../../shared/data-models/src/lib/audit-log.entity';
import { InitialSchema1717977600000 } from './migrations/1717977600000-InitialSchema';
import { AddTwoFactorAuth1718000000000 } from './migrations/1718000000000-AddTwoFactorAuth';
import { AddGroupCurrencyAndExpenseSoftDelete1718100000000 } from './migrations/1718100000000-AddGroupCurrencyAndExpenseSoftDelete';
import { AddGroupTypeAndSpectatorAndHousehold1718200000000 } from './migrations/1718200000000-AddGroupTypeAndSpectatorAndHousehold';
import { EncryptExpenseAmounts1718300000000 } from './migrations/1718300000000-EncryptExpenseAmounts';
import { AddUserPhoneAndGroupInviteToken1718400000000 } from './migrations/1718400000000-AddUserPhoneAndGroupInviteToken';
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
    AuditLog
  ],
  migrations: [
    InitialSchema1717977600000,
    AddTwoFactorAuth1718000000000,
    AddGroupCurrencyAndExpenseSoftDelete1718100000000,
    AddGroupTypeAndSpectatorAndHousehold1718200000000,
    EncryptExpenseAmounts1718300000000,
    AddUserPhoneAndGroupInviteToken1718400000000,
  ],
  namingStrategy: new SnakeNamingStrategy(),
  synchronize: false,
});
