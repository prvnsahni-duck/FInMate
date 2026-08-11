import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  DirectLedgerEntry,
  Expense,
  ExpensePayment,
  ExpenseSplit,
  Group,
  GroupMember,
  Settlement,
  User,
} from '@finmate/data-models';
import { PeopleController } from './people.controller';
import { PersonLedgerService } from './person-ledger.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DirectLedgerEntry,
      Expense,
      ExpensePayment,
      ExpenseSplit,
      Group,
      GroupMember,
      Settlement,
      User,
    ]),
  ],
  controllers: [PeopleController],
  providers: [PersonLedgerService],
  exports: [PersonLedgerService],
})
export class PeopleModule {}
