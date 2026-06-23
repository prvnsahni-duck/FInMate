import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { from, Observable } from 'rxjs';
import { mergeMap, map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { Store } from '@ngxs/store';
import { AuthState } from '../../../core/auth/auth.state';
import { ClientEncryptionService } from '../../../core/services/encryption.service';
import { CreateRecurringExpenseDto, UpdateRecurringExpenseDto } from '@finmate/data-models';

@Injectable({
  providedIn: 'root'
})
export class RecurringExpensesService {
  private http = inject(HttpClient);
  private store = inject(Store);
  private encryptionService = inject(ClientEncryptionService);
  private baseUrl = environment.apiBaseUrl;

  private async encryptPayload(payload: CreateRecurringExpenseDto | UpdateRecurringExpenseDto): Promise<any> {
    const user = this.store.selectSnapshot(AuthState.getUser);
    const email = user?.email;
    if (email) {
      const key = await this.encryptionService.loadKeyFromSession(email);
      if (key) {
        const encrypted = { ...payload };
        if (payload.title) {
          encrypted.title = await this.encryptionService.encrypt(payload.title, key);
        }
        if (payload.description) {
          encrypted.description = await this.encryptionService.encrypt(payload.description, key);
        }
        return encrypted;
      }
    }
    return payload;
  }

  getRecurringExpenses(groupId?: string): Observable<any[]> {
    let params = new HttpParams();
    if (groupId) {
      params = params.set('groupId', groupId);
    }

    return this.http.get<any>(`${this.baseUrl}/recurring-expenses`, { params }).pipe(
      map((res) => res.data || []),
      mergeMap(async (templates: any[]) => {
        const user = this.store.selectSnapshot(AuthState.getUser);
        const email = user?.email;
        if (email && templates.length > 0) {
          const key = await this.encryptionService.loadKeyFromSession(email);
          if (key) {
            return Promise.all(
              templates.map(async (template) => {
                try {
                  return await this.encryptionService.decryptExpense(template, key);
                } catch (e) {
                  return template;
                }
              })
            );
          }
        }
        return templates;
      })
    );
  }

  createRecurringExpense(payload: CreateRecurringExpenseDto): Observable<any> {
    return from(this.encryptPayload(payload)).pipe(
      mergeMap((encryptedPayload) =>
        this.http.post<any>(`${this.baseUrl}/recurring-expenses`, encryptedPayload)
      ),
      map((res) => res.data),
      mergeMap(async (template) => {
        const user = this.store.selectSnapshot(AuthState.getUser);
        const email = user?.email;
        if (email) {
          const key = await this.encryptionService.loadKeyFromSession(email);
          if (key) {
            try {
              return await this.encryptionService.decryptExpense(template, key);
            } catch (e) {}
          }
        }
        return template;
      })
    );
  }

  updateRecurringExpense(id: string, payload: UpdateRecurringExpenseDto): Observable<any> {
    return from(this.encryptPayload(payload)).pipe(
      mergeMap((encryptedPayload) =>
        this.http.patch<any>(`${this.baseUrl}/recurring-expenses/${id}`, encryptedPayload)
      ),
      map((res) => res.data),
      mergeMap(async (template) => {
        const user = this.store.selectSnapshot(AuthState.getUser);
        const email = user?.email;
        if (email) {
          const key = await this.encryptionService.loadKeyFromSession(email);
          if (key) {
            try {
              return await this.encryptionService.decryptExpense(template, key);
            } catch (e) {}
          }
        }
        return template;
      })
    );
  }

  deleteRecurringExpense(id: string): Observable<void> {
    return this.http.delete<any>(`${this.baseUrl}/recurring-expenses/${id}`).pipe(
      map(() => undefined)
    );
  }
}
