import { Module } from '@nestjs/common';
import { UsersModule } from './users.module';
import { ExpensesModule } from './expenses.module';

@Module({
  imports: [UsersModule, ExpensesModule],
})
export class AuthModule {}
