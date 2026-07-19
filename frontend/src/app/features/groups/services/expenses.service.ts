import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { from, Observable } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { Store } from '@ngxs/store';
import { AuthState } from '../../../core/auth/auth.state';
import { ClientEncryptionService } from '../../../core/services/encryption.service';
import {
  CategoryAnalyticsPoint,
  CreateExpenseDto,
  Expense,
  GetExpensesResponse,
  MonthlyAnalyticsPoint,
  UpdateExpenseDto,
} from '@finmate/data-models';
import { SESSION_EXPIRED_MESSAGE } from '../../../core/constants/crypto.constants';
import { mapDecryptExpense } from '../../../core/utils/crypto-operators';
import { GroupKeyService } from '../../../core/services/group-key.service';
import { ExpenseDecryptionService } from '../../../core/services/expense-decryption.service';

@Injectable({
  providedIn: 'root',
})
export class ExpensesService {
  private http = inject(HttpClient);
  private store = inject(Store);
  private encryptionService = inject(ClientEncryptionService);
  private groupKeyService = inject(GroupKeyService);
  private decryptor = inject(ExpenseDecryptionService);
  private baseUrl = environment.apiBaseUrl;

  /**
   * Encrypts CreateExpenseDto or UpdateExpenseDto outgoing payloads.
   */
  private async encryptPayload(
    payload: CreateExpenseDto | UpdateExpenseDto,
  ): Promise<any> {
    const user = this.store.selectSnapshot(AuthState.getUser);
    const email = user?.email;
    if (email) {
      const masterKey = await this.encryptionService.loadKeyFromSession(email);
      if (!masterKey) {
        throw new Error(SESSION_EXPIRED_MESSAGE);
      }

      const encrypted = { ...payload } as any;

      // 1. Determine encryption scope and pick corresponding key
      let scope: 'personal' | 'group' = 'personal';
      let key: CryptoKey = masterKey;

      if ((payload as any).groupId) {
        scope = 'group';
        const groupId = (payload as any).groupId as string;
        const resolved =
          await this.groupKeyService.getGroupKeyForEncryption(groupId);
        if (resolved) {
          key = resolved.key;
          encrypted.groupKeyVersionId = resolved.versionId;
        } else {
          key = await this.groupKeyService.createGroupKey(groupId);
          const mintedVersionId =
            this.groupKeyService.getKnownActiveVersionId(groupId);
          if (mintedVersionId) {
            encrypted.groupKeyVersionId = mintedVersionId;
          }
        }
      } else {
        const currentUserId = user?.userId;
        const splits = payload.splits || [];
        const otherParticipants = splits.filter(
          (s) => s.participantUserId && s.participantUserId !== currentUserId,
        );

        if (otherParticipants.length > 0) {
          throw new Error(
            'Shared expenses must belong to a group and use group encryption scope.',
          );
        }
      }

      encrypted.encryptionScope = scope;

      if (payload.title) {
        encrypted.title = await this.encryptionService.encrypt(
          payload.title,
          key,
        );
      }

      if (payload.description) {
        encrypted.description = await this.encryptionService.encrypt(
          payload.description,
          key,
        );
      }

      return encrypted;
    }
    return payload;
  }

  /**
   * Fetch expenses for a group or personal dashboard.
   */
  getExpenses(
    groupId: string,
    options: {
      page?: number;
      limit?: number;
      category?: string;
      startDate?: string;
      endDate?: string;
    } = {},
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

    return this.http
      .get<GetExpensesResponse>(`${this.baseUrl}/expenses`, { params })
      .pipe(
        mergeMap(async (res) => {
          const payload = res.data as
            | Expense[]
            | { data?: Expense[] }
            | undefined;
          const expenses = Array.isArray(payload)
            ? payload
            : Array.isArray(payload?.data)
              ? payload.data
              : undefined;
          if (!expenses || expenses.length === 0) {
            return res;
          }

          // Single decryption pipeline: resolves keys per scope, classifies any
          // failure, and preserves ciphertext so items can be retried later.
          const decryptedExpenses = await this.decryptor.decryptExpenses(
            expenses as any[],
          );

          if (Array.isArray(payload)) {
            res.data = decryptedExpenses as any;
          } else if (payload && Array.isArray(payload.data)) {
            payload.data = decryptedExpenses as any;
          }
          return res;
        }),
      );
  }

  /**
   * Create a new expense.
   */
  createExpense(payload: CreateExpenseDto): Observable<Expense> {
    return from(this.encryptPayload(payload)).pipe(
      mergeMap((encryptedPayload) =>
        this.http.post<Expense>(`${this.baseUrl}/expenses`, encryptedPayload),
      ),
      mapDecryptExpense(this.decryptor),
    );
  }

  /**
   * Update an existing expense.
   */
  updateExpense(id: string, payload: UpdateExpenseDto): Observable<Expense> {
    return from(this.encryptPayload(payload)).pipe(
      mergeMap((encryptedPayload) =>
        this.http.patch<Expense>(
          `${this.baseUrl}/expenses/${id}`,
          encryptedPayload,
        ),
      ),
      mapDecryptExpense(this.decryptor),
    );
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
    return this.http
      .post<Expense>(`${this.baseUrl}/expenses/${id}/restore`, {})
      .pipe(mapDecryptExpense(this.decryptor));
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
   * Returns the calling user's personal expenses + group shares.
   * Each item has `myShare` (user's portion) and `expenseType` (PERSONAL | GROUP_SHARE).
   * Dashboard totals must use `myShare`, never `amountTotal`.
   */
  getMyExpenses(options: { page?: number; limit?: number } = {}): Observable<any> {
    let params = new HttpParams();
    if (options.page) params = params.set('page', options.page.toString());
    if (options.limit) params = params.set('limit', options.limit.toString());
    return this.http
      .get<any>(`${this.baseUrl}/expenses/me`, { params })
      .pipe(
        mergeMap(async (res) => {
          const items: any[] = Array.isArray(res.data)
            ? res.data
            : Array.isArray(res.data?.data)
              ? res.data.data
              : [];
          if (items.length === 0) return res;
          const decrypted = await this.decryptor.decryptExpenses(items);
          if (Array.isArray(res.data)) {
            res.data = decrypted;
          } else if (res.data && Array.isArray(res.data.data)) {
            res.data.data = decrypted;
          }
          return res;
        }),
      );
  }

  /**
   * Combined monthly total (personal expenses + myShare of group expenses).
   * Returns total across all categories for the given month.
   */
  getCombinedMonthlyTotal(month?: string): Observable<number> {
    const m = month ?? new Date().toISOString().slice(0, 7);
    return this.http
      .get<any>(`${this.baseUrl}/expenses/analytics/all-monthly?month=${m}`)
      .pipe(
        mergeMap(async (res) => {
          const items: { category: string; amount: number }[] = Array.isArray(res.data)
            ? res.data
            : [];
          return items.reduce((sum, i) => sum + Number(i.amount), 0);
        }),
      );
  }

  /**
   * Returns the append-only version history for an expense.
   * Read-only — versions carry the encrypted snapshot from the time of each action.
   */
  getExpenseVersionHistory(expenseId: string): Observable<any[]> {
    return this.http
      .get<any>(`${this.baseUrl}/expenses/${expenseId}/versions`)
      .pipe(
        mergeMap(async (res) => {
          const versions: any[] = Array.isArray(res.data) ? res.data : [];
          return versions;
        }),
      );
  }

  /**
   * Export expenses ledger.
   */
  exportExpenses(groupId: string, format: 'csv' | 'xlsx'): Observable<Blob> {
    return this.http.get(
      `${this.baseUrl}/export/expenses?groupId=${groupId}&format=${format}`,
      {
        responseType: 'blob',
      },
    );
  }

  /**
   * Import expenses.
   */
  importExpenses(formData: FormData): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/import/expenses`, formData);
  }
}
