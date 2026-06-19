import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog, Group, GroupMember, GroupMemberContribution } from '@finmate/data-models';
import { GroupsService } from './groups.service';
import { GroupsController } from './groups.controller';
import { MembersController } from './members.controller';
import { InviteController } from './invite.controller';
import { GroupRolesGuard } from '../auth/guards/group-roles.guard';
import { ExpensesModule } from '../expenses/expenses.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Group, GroupMember, GroupMemberContribution, AuditLog]),
    ExpensesModule,
    EmailModule,
  ],
  controllers: [GroupsController, MembersController, InviteController],
  providers: [GroupsService, GroupRolesGuard],
  exports: [GroupsService],
})
export class GroupsModule {}
