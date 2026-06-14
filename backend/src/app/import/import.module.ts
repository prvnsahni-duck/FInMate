import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Group, GroupMember, Expense, ExpenseSplit, User } from '@finmate/data-models';
import { ImportController } from './import.controller';
import { ExportController } from './export.controller';
import { ImportService } from './import.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Group, GroupMember, Expense, ExpenseSplit, User]),
  ],
  controllers: [ImportController, ExportController],
  providers: [ImportService],
  exports: [ImportService],
})
export class ImportModule {}
