import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AuditLog,
  Attachment,
  Expense,
  ExpenseSplit,
  Group,
  GroupMember,
  User,
  RecurringExpense,
  RecurringExpenseSplit,
} from '@finmate/data-models';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { RecurringExpensesController } from './recurring-expenses.controller';
import { RecurringExpensesService } from './services/recurring-expenses.service';
import { RecurringExpensesScheduler } from './services/recurring-expenses.scheduler';
import {
  ExpensesAccessService,
  ExpensesAnalyticsService,
  ExpensesCarryForwardService,
  ExpensesCrudService,
} from './services';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Expense,
      ExpenseSplit,
      RecurringExpense,
      RecurringExpenseSplit,
      Group,
      GroupMember,
      User,
      Attachment,
      AuditLog,
    ]),
  ],
  controllers: [ExpensesController, RecurringExpensesController],
  providers: [
    ExpensesService,
    ExpensesAccessService,
    ExpensesAnalyticsService,
    ExpensesCarryForwardService,
    ExpensesCrudService,
    RecurringExpensesService,
    RecurringExpensesScheduler,
  ],
  exports: [
    ExpensesService,
    ExpensesAccessService,
    ExpensesAnalyticsService,
    ExpensesCarryForwardService,
    ExpensesCrudService,
    RecurringExpensesService,
    RecurringExpensesScheduler,
  ],
})
export class ExpensesModule {}
