import { Injectable } from '@nestjs/common';
import { ExpensesService } from '../expenses.service';

export interface AnalyticsFilter {
  userId: string;
  groupId?: string;
  startDate?: string;
  endDate?: string;
  // ── Unified group-filter dimensions ──────────────────────────────────────
  category?: string;
  /** Group-member id (participant via splits). */
  memberId?: string;
  /** Group-member id (payer). */
  paidById?: string;
  /** `undefined` applies no transaction-type filter. */
  transactionType?: 'expense' | 'refund';
}

export interface MonthlyTotal {
  month: string;
  total: number;
  currency: string;
}

export interface CategoryTotal {
  category: string;
  total: number;
  currency: string;
}

@Injectable()
export class ExpensesAnalyticsService {
  constructor(private readonly expensesService: ExpensesService) {}

  async getMonthlySummary(
    filter: AnalyticsFilter & { year: number },
  ): Promise<MonthlyTotal[]> {
    return this.expensesService.getMonthlySummary(filter);
  }

  async getYearlySummary(filter: AnalyticsFilter): Promise<MonthlyTotal[]> {
    return this.expensesService.getYearlySummary(filter);
  }

  async getCategoryDistribution(
    filter: AnalyticsFilter,
  ): Promise<CategoryTotal[]> {
    return this.expensesService.getCategoryDistribution(filter);
  }

  async getCombinedMonthlyAnalytics(
    userId: string,
    month: string,
  ): Promise<{ category: string; amount: number; currency: string }[]> {
    return this.expensesService.getCombinedMonthlyAnalytics(userId, month);
  }
}
