import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import {
  CreateDirectSettlementDto,
  CreateDirectTransactionDto,
  DirectLedgerEntry,
  PeopleOverviewResponse,
  PersonDetailResponse,
  UpdateDirectTransactionDto,
} from '@finmate/data-models';
import { ExpenseDecryptionService } from '../../../core/services/expense-decryption.service';
import { DECRYPTION_FAILED_PLACEHOLDER } from '../../../core/constants/crypto.constants';

/**
 * Data access for the People (person-to-person balances) feature. The backend
 * is the single source of truth for every balance, direction, breakdown, and
 * settlement validation — this service only fetches/submits and decrypts
 * group-expense titles for display (reusing the standard expense decryptor).
 */
@Injectable({ providedIn: 'root' })
export class PeopleService {
  private http = inject(HttpClient);
  private decryptor = inject(ExpenseDecryptionService);
  private baseUrl = environment.apiBaseUrl;

  /** Dashboard/list overview. Pass `limit` (e.g. 5) for the dashboard widget. */
  getOverview(limit?: number): Observable<PeopleOverviewResponse> {
    let params = new HttpParams();
    if (limit && limit > 0) params = params.set('limit', String(limit));
    return this.http.get<PeopleOverviewResponse>(`${this.baseUrl}/people`, {
      params,
    });
  }

  /**
   * Full relationship with one person. Group-expense history titles are E2EE
   * ciphertext; they are decrypted here via the shared expense decryptor so the
   * People UI never implements its own crypto.
   */
  getPersonDetail(userId: string): Observable<PersonDetailResponse> {
    return this.http
      .get<PersonDetailResponse>(`${this.baseUrl}/people/${userId}`)
      .pipe(mergeMap((res) => this.decryptHistoryTitles(res)));
  }

  createTransaction(
    userId: string,
    dto: CreateDirectTransactionDto,
  ): Observable<DirectLedgerEntry> {
    return this.http.post<DirectLedgerEntry>(
      `${this.baseUrl}/people/${userId}/transactions`,
      dto,
    );
  }

  createSettlement(
    userId: string,
    dto: CreateDirectSettlementDto,
  ): Observable<DirectLedgerEntry> {
    return this.http.post<DirectLedgerEntry>(
      `${this.baseUrl}/people/${userId}/settlements`,
      dto,
    );
  }

  updateTransaction(
    id: string,
    dto: UpdateDirectTransactionDto,
  ): Observable<DirectLedgerEntry> {
    return this.http.patch<DirectLedgerEntry>(
      `${this.baseUrl}/people/transactions/${id}`,
      dto,
    );
  }

  deleteTransaction(id: string): Observable<void> {
    return this.http.delete<void>(
      `${this.baseUrl}/people/transactions/${id}`,
    );
  }

  /** Decrypt group-expense titles in-place (returns a new response object). */
  private async decryptHistoryTitles(
    res: PersonDetailResponse,
  ): Promise<PersonDetailResponse> {
    const history = await Promise.all(
      res.history.map(async (item) => {
        if (item.source !== 'group_expense' || !item.title) return item;
        try {
          const decrypted = await this.decryptor.decryptExpense({
            id: item.expenseId,
            title: item.title,
            encryptionScope: item.encryptionScope,
            groupId: item.groupId,
            groupKeyVersionId: item.groupKeyVersionId,
          });
          return {
            ...item,
            title: decrypted.title ?? DECRYPTION_FAILED_PLACEHOLDER,
          };
        } catch {
          return { ...item, title: DECRYPTION_FAILED_PLACEHOLDER };
        }
      }),
    );
    return { ...res, history };
  }
}
