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
import {
  DECRYPTION_FAILED_PLACEHOLDER,
  SESSION_EXPIRED_MESSAGE,
} from '../../../core/constants/crypto.constants';
import { mapDecryptExpense } from '../../../core/utils/crypto-operators';
import { GroupKeyService } from '../../../core/services/group-key.service';

type EncryptedExpensePayload = Expense & {
  title: string;
  description?: string;
  [key: string]: unknown;
};

const EXPENSE_DECRYPTION_BATCH_SIZE = 25;

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

@Injectable({
  providedIn: 'root',
})
export class ExpensesService {
  private http = inject(HttpClient);
  private store = inject(Store);
  private encryptionService = inject(ClientEncryptionService);
  private groupKeyService = inject(GroupKeyService);
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
        let gKey = await this.groupKeyService.getGroupDataKey((payload as any).groupId);
        if (!gKey) {
          gKey = await this.groupKeyService.createGroupKey((payload as any).groupId);
        }
        key = gKey;
      } else {
        const currentUserId = user?.userId;
        const splits = payload.splits || [];
        const otherParticipants = splits.filter(
          (s) => s.participantUserId && s.participantUserId !== currentUserId
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
          const expenses = res.data as Expense[] | undefined;
          if (!expenses || expenses.length === 0) {
            return res;
          }

          const user = this.store.selectSnapshot(AuthState.getUser);
          const email = user?.email;
          if (!email) {
            return res;
          }

          const key = await this.encryptionService.loadKeyFromSession(email);
          if (!key) {
            return res;
          }

          const decryptedExpenses: Expense[] = [];

          for (
            let index = 0;
            index < expenses.length;
            index += EXPENSE_DECRYPTION_BATCH_SIZE
          ) {
            const batch = expenses.slice(
              index,
              index + EXPENSE_DECRYPTION_BATCH_SIZE,
            );
            const decryptedBatch = await Promise.all(
              batch.map(async (expense: any) => {
                try {
                  let key: CryptoKey | null = null;
                  const scope = expense.encryptionScope || 'personal';
                  const gId = expense.groupId;

                  if (scope === 'group' && gId) {
                    key = await this.groupKeyService.getGroupDataKey(gId);
                  } else if (scope === 'direct_shared') {
                    const wrappedContentKeys = expense.wrappedContentKeys || [];
                    const myWrapped = wrappedContentKeys.find((wk: any) => wk.userId === user?.userId);
                    if (myWrapped) {
                      const masterKey = await this.encryptionService.loadKeyFromSession(email);
                      if (masterKey) {
                        key = await this.encryptionService.unwrapKey(myWrapped.wrappedKey, masterKey);
                      }
                    }
                  } else {
                    key = await this.encryptionService.loadKeyFromSession(email);
                  }

                  if (!key) {
                    throw new Error('Key not available for scope ' + scope);
                  }

                  const decrypted = await this.encryptionService.decryptExpense(
                    expense as EncryptedExpensePayload,
                    key,
                  );
                  return {
                    ...expense,
                    title: decrypted.title,
                    description: decrypted.description,
                  };
                } catch (e) {
                  console.error('Decryption failed for expense', expense.id, e);
                  return {
                    ...expense,
                    title: DECRYPTION_FAILED_PLACEHOLDER,
                    description: '',
                  };
                }
              }),
            );
            decryptedExpenses.push(...decryptedBatch);

            if (index + EXPENSE_DECRYPTION_BATCH_SIZE < expenses.length) {
              await yieldToBrowser();
            }
          }

          res.data = decryptedExpenses;
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
      mapDecryptExpense(this.store, this.encryptionService, this.groupKeyService),
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
      mapDecryptExpense(this.store, this.encryptionService, this.groupKeyService),
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
      .pipe(mapDecryptExpense(this.store, this.encryptionService, this.groupKeyService));
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
