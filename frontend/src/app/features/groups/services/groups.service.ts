import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Group, GroupMember, Expense } from '@finmate/data-models';

export interface GroupBalancesResponse {
  balances: Array<{
    userId: string;
    currency: string;
    netBalance: number;
  }>;
  suggestedSettlements: Array<{
    fromUserId: string;
    toUserId: string;
    amount: number;
    currency: string;
  }>;
}

export interface GroupAuditLogResponse {
  data: Array<{
    id: string;
    action: string;
    actorDisplayName?: string;
    metadata?: {
      title?: string;
      newTitle?: string;
      amountTotal?: number;
      currency?: string;
    };
    createdAt: string | Date;
  }>;
}

@Injectable({
  providedIn: 'root'
})
export class GroupsService {
  private http = inject(HttpClient);

  /**
   * Fetch all active groups.
   */
  getGroups(): Observable<{ data: Group[]; meta?: { totalItems: number } }> {
    return this.http.get<{ data: Group[]; meta?: { totalItems: number } }>('/api/groups');
  }

  /**
   * Fetch a single group by ID.
   */
  getGroup(id: string): Observable<Group> {
    return this.http.get<Group>(`/api/groups/${id}`);
  }

  /**
   * Create a new group.
   */
  createGroup(groupData: any): Observable<Group> {
    return this.http.post<Group>('/api/groups', groupData);
  }

  /**
   * Fetch members of a group.
   */
  getMembers(groupId: string): Observable<GroupMember[]> {
    return this.http.get<GroupMember[]>(`/api/groups/${groupId}/members`);
  }

  /**
   * Fetch settlements & balances of a group.
   */
  getBalances(groupId: string): Observable<GroupBalancesResponse> {
    return this.http.get<GroupBalancesResponse>(`/api/groups/${groupId}/settlements/balances`);
  }

  /**
   * Fetch history/audit logs of a group.
   */
  getHistoryLogs(groupId: string): Observable<GroupAuditLogResponse> {
    return this.http.get<GroupAuditLogResponse>(`/api/groups/${groupId}/history`);
  }

  /**
   * Fetch deleted/soft-deleted expenses in a group.
   */
  getDeletedExpenses(groupId: string): Observable<{ data: Expense[] }> {
    return this.http.get<{ data: Expense[] }>(`/api/groups/${groupId}/expenses/deleted`);
  }

  /**
   * Fetch carry-forward details for a specific month.
   */
  getCarryForward(groupId: string, month: string): Observable<any[]> {
    return this.http.get<any[]>(`/api/groups/${groupId}/carry-forward?month=${month}`);
  }
}

