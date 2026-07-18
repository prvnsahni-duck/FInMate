import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Group,
  GroupMember,
  Expense,
  ExpenseSplit,
  Settlement,
  SettlementVersion,
  AuditLog,
} from '@finmate/data-models';
import { SettlementsService } from './settlements.service';
import { SettlementsController } from './settlements.controller';
import { FriendsController } from './friends.controller';
import { GroupRolesGuard } from '../auth/guards/group-roles.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Group,
      GroupMember,
      Expense,
      ExpenseSplit,
      Settlement,
      SettlementVersion,
      AuditLog,
    ]),
  ],
  controllers: [SettlementsController, FriendsController],
  providers: [SettlementsService, GroupRolesGuard],
  exports: [SettlementsService],
})
export class SettlementsModule {}
