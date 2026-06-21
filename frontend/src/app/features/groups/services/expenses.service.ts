import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  CategoryAnalyticsPoint,
  CreateExpenseDto,
  Expense,
  GetExpensesResponse,
  MonthlyAnalyticsPoint,
  UpdateExpenseDto,
} from '@finmate/data-models';
import { signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ExpensesService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiBaseUrl;

  showCreateExpenseModal = signal<boolean>(false);
  expenseCreated$ = new Subject<void>();
  activeTab = signal<string>('Home');

  /**
   * Fetch expenses for a group or personal dashboard.
   */
  getExpenses(
    groupId: string,
    options: { page?: number; limit?: number; category?: string; startDate?: string; endDate?: string } = {}
  ): Observable<GetExpensesResponse> {
    let params = new HttpParams().set('groupId', groupId);
    
    if (options.page !== undefined) {
      params = params.set('page', options.page.toString());
    }
    if (options.limit !== undefined) {
      params = params.set('limit', options.limit.toString());
    }
    if (options.category) {
      params = params.set('category', options.category);
    }
    if (options.startDate) {
      params = params.set('startDate', options.startDate);
    }
    if (options.endDate) {
      params = params.set('endDate', options.endDate);
    }

    return this.http.get<GetExpensesResponse>(`${this.baseUrl}/expenses`, { params });
  }

  /**
   * Create a new expense.
   */
  createExpense(payload: CreateExpenseDto): Observable<Expense> {
    return this.http.post<Expense>(`${this.baseUrl}/expenses`, payload);
  }

  /**
   * Update an existing expense.
   */
  updateExpense(id: string, payload: UpdateExpenseDto): Observable<Expense> {
    return this.http.patch<Expense>(`${this.baseUrl}/expenses/${id}`, payload);
  }

  /**
   * Delete an expense.
   */
  deleteExpense(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/expenses/${id}`);
  }

  /**
   * Restore a deleted expense.
   */
  restoreExpense(id: string): Observable<Expense> {
    return this.http.post<Expense>(`${this.baseUrl}/expenses/${id}/restore`, {});
  }

  /**
   * Fetch monthly summaries for analytics.
   */
  getMonthlyAnalytics(groupId?: string): Observable<MonthlyAnalyticsPoint[]> {
    let url = `${this.baseUrl}/expenses/analytics/monthly`;
    if (groupId && groupId !== 'personal') {
      url += `?groupId=${groupId}`;
    }
    return this.http.get<MonthlyAnalyticsPoint[]>(url);
  }

  /**
   * Fetch category analytics.
   */
  getCategoryAnalytics(groupId?: string): Observable<CategoryAnalyticsPoint[]> {
    let url = `${this.baseUrl}/expenses/analytics/categories`;
    if (groupId && groupId !== 'personal') {
      url += `?groupId=${groupId}`;
    }
    return this.http.get<CategoryAnalyticsPoint[]>(url);
  }

  /**
   * Export expenses ledger.
   */
  exportExpenses(groupId: string, format: 'csv' | 'xlsx'): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/export/expenses?groupId=${groupId}&format=${format}`, {
      responseType: 'blob'
    });
  }

  /**
   * Import expenses.
   */
  importExpenses(formData: FormData): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/import/expenses`, formData);
  }
}
