import { Injectable } from '@nestjs/common';
import { CreateExpenseDto, UpdateExpenseDto } from '../dto';
import { PaginatedResponse } from '../../common/pagination.util';
import { ExpensesService } from '../expenses.service';

export interface ExpenseListParams {
  page: number;
  limit: number;
  cursor?: string;
  groupId?: string;
  category?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

@Injectable()
export class ExpensesCrudService {
  constructor(private readonly expensesService: ExpensesService) {}

  async createExpense(
    userId: string,
    dto: CreateExpenseDto,
  ): Promise<Record<string, unknown>> {
    return this.expensesService.createExpense(userId, dto);
  }

  async listExpenses(
    userId: string,
    params: ExpenseListParams,
  ): Promise<PaginatedResponse<Record<string, unknown>>> {
    return this.expensesService.listExpenses(userId, params);
  }

  async getExpenseById(
    userId: string,
    id: string,
  ): Promise<Record<string, unknown>> {
    return this.expensesService.getExpenseById(userId, id);
  }

  async updateExpense(
    userId: string,
    id: string,
    dto: UpdateExpenseDto,
  ): Promise<Record<string, unknown>> {
    return this.expensesService.updateExpense(userId, id, dto);
  }

  async deleteExpense(userId: string, id: string): Promise<void> {
    return this.expensesService.deleteExpense(userId, id);
  }

  async restoreExpense(
    userId: string,
    id: string,
  ): Promise<Record<string, unknown>> {
    return this.expensesService.restoreExpense(userId, id);
  }
}
