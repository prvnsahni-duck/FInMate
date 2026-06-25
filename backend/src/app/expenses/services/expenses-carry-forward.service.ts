import { Injectable } from '@nestjs/common';
import { PaginatedResponse } from '../../common/pagination.util';
import { ExpensesService } from '../expenses.service';

export interface CarryForwardSummaryItem {
  userId: string;
  displayName: string | null;
  netBalance: number;
  currency: string;
}

@Injectable()
export class ExpensesCarryForwardService {
  constructor(private readonly expensesService: ExpensesService) {}

  async getCarryForwardSummary(
    userId: string,
    groupId: string,
    ledgerMonth: string,
  ): Promise<any[]> {
    return this.expensesService.getCarryForwardSummary(
      userId,
      groupId,
      ledgerMonth,
    );
  }

  async closeMonth(
    userId: string,
    groupId: string,
    ledgerMonth: string,
  ): Promise<{ nextLedgerMonth: string; carryForwardExpenseCount: number }> {
    return this.expensesService.closeMonth(userId, groupId, ledgerMonth);
  }

  async listDeletedExpenses(
    userId: string,
    groupId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<Record<string, unknown>>> {
    return this.expensesService.listDeletedExpenses(
      userId,
      groupId,
      page,
      limit,
    );
  }
}
