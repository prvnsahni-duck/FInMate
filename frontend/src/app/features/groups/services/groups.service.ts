import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { Store } from '@ngxs/store';
import { environment } from '../../../../environments/environment';
import { AuthState } from '../../../core/auth/auth.state';
import { ClientEncryptionService } from '../../../core/services/encryption.service';
import { GroupKeyService } from '../../../core/services/group-key.service';
import { DECRYPTION_FAILED_PLACEHOLDER } from '../../../core/constants/crypto.constants';
import { ExpenseDecryptionService } from '../../../core/services/expense-decryption.service';
import {
  CarryForwardBalance,
  CreateGroupDto,
  Expense,
  Group,
  GroupAuditLogResponse,
  GroupBalancesResponse,
  GroupContributionResponse,
  GroupMember,
  InviteDetailsResponse,
  PaginatedResponse,
  PendingInvitationResponse,
  UpdateContributionDto,
  UpdateContributionsPayload,
  UpdateGroupDto,
} from '@finmate/data-models';

/** The unified group-filter dimensions passed to the balances/trash endpoints. */
export interface GroupFilterQueryOptions {
  from?: string;
  to?: string;
  categories?: string[];
  memberIds?: string[];
  paidByIds?: string[];
  transactionType?: 'expense' | 'refund';
  minAmount?: number;
  maxAmount?: number;
}

/**
 * Balances response: `overall` is the all-time picture (carry-forward intact);
 * `filtered` recomputes balances/settlements for the active filter.
 */
export interface GroupBalancesResult {
  overall: GroupBalancesResponse;
  filtered: GroupBalancesResponse;
}

@Injectable({
  providedIn: 'root',
})
export class GroupsService {
  private http = inject(HttpClient);
  private store = inject(Store);
  private groupKeyService = inject(GroupKeyService);
  private encryptionService = inject(ClientEncryptionService);
  private decryptor = inject(ExpenseDecryptionService);
  private baseUrl = environment.apiBaseUrl;

  /**
   * Fetch all active groups.
   */
  getGroups(): Observable<PaginatedResponse<Group>> {
    return this.http.get<PaginatedResponse<Group>>(`${this.baseUrl}/groups`);
  }

  /**
   * Fetch a single group by ID.
   */
  getGroup(id: string): Observable<Group> {
    return this.http.get<Group>(`${this.baseUrl}/groups/${id}`);
  }

  /**
   * Create a new group.
   */
  createGroup(groupData: CreateGroupDto): Observable<Group> {
    return this.http.post<Group>(`${this.baseUrl}/groups`, groupData);
  }

  /**
   * Fetch members of a group.
   */
  getMembers(groupId: string): Observable<GroupMember[]> {
    return this.http.get<GroupMember[]>(
      `${this.baseUrl}/groups/${groupId}/members`,
    );
  }

  /**
   * Append the unified group-filter dimensions to query params (shared by the
   * balances and trash endpoints). Arrays serialize comma-joined.
   */
  private appendFilterParams(
    params: HttpParams,
    o?: GroupFilterQueryOptions,
  ): HttpParams {
    if (!o) return params;
    if (o.from) params = params.set('from', o.from);
    if (o.to) params = params.set('to', o.to);
    if (o.categories?.length) {
      params = params.set('categories', o.categories.join(','));
    }
    if (o.memberIds?.length) {
      params = params.set('memberIds', o.memberIds.join(','));
    }
    if (o.paidByIds?.length) {
      params = params.set('paidByIds', o.paidByIds.join(','));
    }
    if (o.transactionType) {
      params = params.set('transactionType', o.transactionType);
    }
    if (o.minAmount != null)
      params = params.set('minAmount', String(o.minAmount));
    if (o.maxAmount != null)
      params = params.set('maxAmount', String(o.maxAmount));
    return params;
  }

  /**
   * Fetch settlements & balances of a group. Returns both the all-time `overall`
   * balances (carry-forward intact) and the `filtered` balances for the supplied
   * filter, so the UI can show both.
   */
  getBalances(
    groupId: string,
    options?: GroupFilterQueryOptions,
  ): Observable<GroupBalancesResult> {
    const params = this.appendFilterParams(new HttpParams(), options);
    return this.http.get<GroupBalancesResult>(
      `${this.baseUrl}/groups/${groupId}/settlements/balances`,
      { params },
    );
  }

  getHistoryLogs(
    groupId: string,
    page = 1,
    limit = 20,
    range?: { from?: string; to?: string },
  ): Observable<GroupAuditLogResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());
    if (range?.from) params = params.set('from', range.from);
    if (range?.to) params = params.set('to', range.to);
    return this.http
      .get<GroupAuditLogResponse>(`${this.baseUrl}/groups/${groupId}/history`, {
        params,
      })
      .pipe(
        mergeMap(async (res) => {
          const logs = res.data || [];
          if (logs.length === 0) return res;

          const user = this.store.selectSnapshot(AuthState.getUser);
          const email = user?.email;
          if (!email) return res;

          const key = await this.groupKeyService.getGroupDataKey(groupId);

          const decryptedLogs = await Promise.all(
            logs.map(async (log: any) => {
              if (!log.metadata) return log;

              const decryptedMetadata = { ...log.metadata };

              const decryptField = async (field: string, val: string) => {
                if (!val) return '';
                if (!key) {
                  console.warn(
                    `[History Decrypt] Missing group key for log ${log.id}, field '${field}'. Ciphertext: "${val}"`,
                  );
                  return DECRYPTION_FAILED_PLACEHOLDER;
                }
                try {
                  return await this.encryptionService.decrypt(val, key);
                } catch (err: any) {
                  console.error(
                    `[History Decrypt] Decryption failed for log ${log.id}, field '${field}'. ` +
                      `Ciphertext: "${val}". Error: ${err?.message || err}`,
                    err,
                  );
                  return DECRYPTION_FAILED_PLACEHOLDER;
                }
              };

              if (log.metadata.title) {
                decryptedMetadata.title = await decryptField(
                  'title',
                  log.metadata.title,
                );
              }
              if (log.metadata.newTitle) {
                decryptedMetadata.newTitle = await decryptField(
                  'newTitle',
                  log.metadata.newTitle,
                );
              }
              if (log.metadata.previousTitle) {
                decryptedMetadata.previousTitle = await decryptField(
                  'previousTitle',
                  log.metadata.previousTitle,
                );
              }

              return { ...log, metadata: decryptedMetadata };
            }),
          );

          return { ...res, data: decryptedLogs };
        }),
      );
  }

  /**
   * Fetch deleted/soft-deleted expenses in a group.
   */
  getDeletedExpenses(
    groupId: string,
    options?: GroupFilterQueryOptions,
  ): Observable<{ data: Expense[] }> {
    const params = this.appendFilterParams(new HttpParams(), options);
    return this.http
      .get<{
        data: Expense[];
      }>(`${this.baseUrl}/groups/${groupId}/expenses/deleted`, { params })
      .pipe(
        // Decrypt trashed expenses through the same central pipeline as the
        // ledger so titles render (and get contextual states) instead of
        // showing raw ciphertext.
        mergeMap(async (res) => {
          res.data = await this.decryptor.decryptExpenses(res.data || []);
          return res;
        }),
      );
  }

  /**
   * Fetch carry-forward details for a specific month.
   */
  getCarryForward(
    groupId: string,
    month: string,
  ): Observable<CarryForwardBalance[]> {
    return this.http.get<CarryForwardBalance[]>(
      `${this.baseUrl}/groups/${groupId}/carry-forward?month=${month}`,
    );
  }

  /**
   * Update an existing group.
   */
  updateGroup(groupId: string, groupData: UpdateGroupDto): Observable<Group> {
    return this.http.patch<Group>(
      `${this.baseUrl}/groups/${groupId}`,
      groupData,
    );
  }

  /**
   * Archive (soft-delete) a group. Exposed to users as "Delete Group".
   * Only the group owner may call this.
   */
  archiveGroup(groupId: string, reason?: string): Observable<Group> {
    return this.http.delete<Group>(`${this.baseUrl}/groups/${groupId}`, {
      body: reason ? { reason } : {},
    });
  }

  /**
   * Regenerate invite token for a group.
   */
  regenerateInviteToken(groupId: string): Observable<Group> {
    return this.http.post<Group>(
      `${this.baseUrl}/groups/${groupId}/invite-link/regenerate`,
      {},
    );
  }

  /**
   * Join a group using an invite token.
   */
  joinGroup(inviteToken: string): Observable<GroupMember> {
    return this.http.post<GroupMember>(
      `${this.baseUrl}/groups/join/${inviteToken}`,
      {},
    );
  }

  /**
   * Fetch minimal safe metadata for an invite link.
   */
  getInviteDetails(inviteToken: string): Observable<InviteDetailsResponse> {
    return this.http.get<InviteDetailsResponse>(
      `${this.baseUrl}/invite-links/${inviteToken}`,
    );
  }

  /**
   * Get custom contribution percentages for a household group ledger month.
   */
  getContributions(
    groupId: string,
    month: string,
  ): Observable<GroupContributionResponse[]> {
    return this.http.get<GroupContributionResponse[]>(
      `${this.baseUrl}/groups/${groupId}/contributions?month=${month}`,
    );
  }

  /**
   * Update/save custom contribution percentages for a household group ledger month.
   */
  updateContributions(
    groupId: string,
    payload: UpdateContributionDto | UpdateContributionsPayload,
  ): Observable<GroupContributionResponse[]> {
    return this.http.post<GroupContributionResponse[]>(
      `${this.baseUrl}/groups/${groupId}/contributions`,
      payload,
    );
  }

  /**
   * Invite a user to a group.
   */
  inviteMember(
    groupId: string,
    payload: {
      email?: string;
      identifier?: string;
      role?: string;
      displayName?: string;
      wrappedGroupKey?: string;
      wrappingMethod?: 'AES-KW' | 'RSA-OAEP';
      inviteKeyHash?: string;
    },
  ): Observable<{ member: GroupMember; inviteToken: string }> {
    return this.http.post<{ member: GroupMember; inviteToken: string }>(
      `${this.baseUrl}/groups/${groupId}/members`,
      payload,
    );
  }

  /**
   * Update membership role or join status.
   */
  updateMember(
    groupId: string,
    memberId: string,
    payload: { role?: string; joinStatus?: string },
  ): Observable<GroupMember> {
    return this.http.patch<GroupMember>(
      `${this.baseUrl}/groups/${groupId}/members/${memberId}`,
      payload,
    );
  }

  /**
   * Remove/kick a member or revoke a pending invitation.
   */
  removeMember(groupId: string, memberId: string): Observable<void> {
    return this.http.delete<void>(
      `${this.baseUrl}/groups/${groupId}/members/${memberId}`,
    );
  }

  /**
   * Fetch pending invitations for the logged-in user.
   */
  getPendingInvitations(): Observable<PendingInvitationResponse[]> {
    return this.http.get<PendingInvitationResponse[]>(
      `${this.baseUrl}/groups/invitations/pending`,
    );
  }

  /**
   * Close a ledger billing month and roll over carry-forward balances.
   */
  closeMonth(
    groupId: string,
    ledgerMonth: string,
  ): Observable<{ nextLedgerMonth: string; carryForwardExpenseCount: number }> {
    return this.http.post<{
      nextLedgerMonth: string;
      carryForwardExpenseCount: number;
    }>(`${this.baseUrl}/groups/${groupId}/close-month`, { ledgerMonth });
  }
}
