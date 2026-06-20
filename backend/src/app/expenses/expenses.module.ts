import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog, Attachment, Expense, ExpenseSplit, Group, GroupMember, User } from '@finmate/data-models';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import {
  ExpensesAccessService,
  ExpensesAnalyticsService,
  ExpensesCarryForwardService,
  ExpensesCrudService,
} from './services';

@Module({
  imports: [TypeOrmModule.forFeature([Expense, ExpenseSplit, Group, GroupMember, User, Attachment, AuditLog])],
  controllers: [ExpensesController],
  providers: [
    ExpensesService,
    ExpensesAccessService,
    ExpensesAnalyticsService,
    ExpensesCarryForwardService,
    ExpensesCrudService,
  ],
  exports: [
    ExpensesService,
    ExpensesAccessService,
    ExpensesAnalyticsService,
    ExpensesCarryForwardService,
    ExpensesCrudService,
  ],
})
export class ExpensesModule {}
