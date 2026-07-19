import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { from, Observable } from 'rxjs';
import { mergeMap, map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { Store } from '@ngxs/store';
import { ClientEncryptionService } from '../../../core/services/encryption.service';
import { GroupKeyService } from '../../../core/services/group-key.service';
import {
  CreateRecurringExpenseDto,
  UpdateRecurringExpenseDto,
} from '@finmate/data-models';
import {
  mapDecryptExpense,
  mapDecryptExpenses,
} from '../../../core/utils/crypto-operators';
import { ExpenseDecryptionService } from '../../../core/services/expense-decryption.service';

@Injectable({
  providedIn: 'root',
})
export class RecurringExpensesService {
  private http = inject(HttpClient);
  private store = inject(Store);
  private encryptionService = inject(ClientEncryptionService);
  private groupKeyService = inject(GroupKeyService);
  private decryptor = inject(ExpenseDecryptionService);
  private baseUrl = environment.apiBaseUrl;

  private getSubtleCrypto(): SubtleCrypto {
    if (
      typeof window !== 'undefined' &&
      window.crypto &&
      window.crypto.subtle
    ) {
      return window.crypto.subtle;
    }
    if (
      typeof globalThis !== 'undefined' &&
      globalThis.crypto &&
      globalThis.crypto.subtle
    ) {
      return globalThis.crypto.subtle;
    }
    throw new Error('Web Cryptography API is not available');
  }

  private async encryptPayload(
    payload: CreateRecurringExpenseDto | UpdateRecurringExpenseDto,
  ): Promise<any> {
    const user = this.store.selectSnapshot((state: any) => state.auth?.user);
    const email = user?.email;
    if (email) {
      const masterKey = await this.encryptionService.loadKeyFromSession(email);
      if (masterKey) {
        const encrypted = { ...payload } as any;

        let scope: 'personal' | 'group' | 'direct_shared' = 'personal';
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
    }
    return payload;
  }

  getRecurringExpenses(groupId?: string): Observable<any[]> {
    let params = new HttpParams();
    if (groupId) {
      params = params.set('groupId', groupId);
    }

    return this.http
      .get<any>(`${this.baseUrl}/recurring-expenses`, { params })
      .pipe(
        map((res) => res.data || []),
        mapDecryptExpenses(this.decryptor),
      );
  }

  createRecurringExpense(payload: CreateRecurringExpenseDto): Observable<any> {
    return from(this.encryptPayload(payload)).pipe(
      mergeMap((encryptedPayload) =>
        this.http.post<any>(
          `${this.baseUrl}/recurring-expenses`,
          encryptedPayload,
        ),
      ),
      map((res) => res.data),
      mapDecryptExpense(this.decryptor),
    );
  }

  updateRecurringExpense(
    id: string,
    payload: UpdateRecurringExpenseDto,
  ): Observable<any> {
    return from(this.encryptPayload(payload)).pipe(
      mergeMap((encryptedPayload) =>
        this.http.patch<any>(
          `${this.baseUrl}/recurring-expenses/${id}`,
          encryptedPayload,
        ),
      ),
      map((res) => res.data),
      mapDecryptExpense(this.decryptor),
    );
  }

  deleteRecurringExpense(id: string): Observable<void> {
    return this.http
      .delete<any>(`${this.baseUrl}/recurring-expenses/${id}`)
      .pipe(map(() => undefined));
  }
}
