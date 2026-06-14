import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog, Group, GroupMember } from '@finmate/data-models';
import { GroupsService } from './groups.service';
import { GroupsController } from './groups.controller';
import { MembersController } from './members.controller';
import { GroupRolesGuard } from '../auth/guards/group-roles.guard';
import { ExpensesModule } from '../expenses/expenses.module';

@Module({
  imports: [TypeOrmModule.forFeature([Group, GroupMember, AuditLog]), ExpensesModule],
  controllers: [GroupsController, MembersController],
  providers: [GroupsService, GroupRolesGuard],
  exports: [GroupsService],
})
export class GroupsModule {}
