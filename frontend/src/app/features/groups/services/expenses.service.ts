import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Expense } from '@finmate/data-models';

export interface GetExpensesResponse {
  data: Expense[];
  meta?: {
    totalItems: number;
  };
}

@Injectable({
  providedIn: 'root'
})
export class ExpensesService {
  private http = inject(HttpClient);

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

    return this.http.get<GetExpensesResponse>('/api/expenses', { params });
  }

  /**
   * Create a new expense.
   */
  createExpense(payload: any): Observable<Expense> {
    return this.http.post<Expense>('/api/expenses', payload);
  }

  /**
   * Update an existing expense.
   */
  updateExpense(id: string, payload: any): Observable<Expense> {
    return this.http.patch<Expense>(`/api/expenses/${id}`, payload);
  }

  /**
   * Delete an expense.
   */
  deleteExpense(id: string): Observable<void> {
    return this.http.delete<void>(`/api/expenses/${id}`);
  }

  /**
   * Restore a deleted expense.
   */
  restoreExpense(id: string): Observable<Expense> {
    return this.http.post<Expense>(`/api/expenses/${id}/restore`, {});
  }

  /**
   * Fetch monthly summaries for analytics.
   */
  getMonthlyAnalytics(groupId?: string): Observable<any[]> {
    let url = '/api/expenses/analytics/monthly';
    if (groupId && groupId !== 'personal') {
      url += `?groupId=${groupId}`;
    }
    return this.http.get<any[]>(url);
  }

  /**
   * Fetch category analytics.
   */
  getCategoryAnalytics(groupId?: string): Observable<any[]> {
    let url = '/api/expenses/analytics/categories';
    if (groupId && groupId !== 'personal') {
      url += `?groupId=${groupId}`;
    }
    return this.http.get<any[]>(url);
  }

  /**
   * Export expenses ledger.
   */
  exportExpenses(groupId: string, format: 'csv' | 'xlsx'): Observable<Blob> {
    return this.http.get(`/api/export/expenses?groupId=${groupId}&format=${format}`, {
      responseType: 'blob'
    });
  }

  /**
   * Import expenses.
   */
  importExpenses(formData: FormData): Observable<void> {
    return this.http.post<void>('/api/import/expenses', formData);
  }
}

