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

  /**
   * Update an existing group.
   */
  updateGroup(groupId: string, groupData: any): Observable<Group> {
    return this.http.patch<Group>(`/api/groups/${groupId}`, groupData);
  }

  /**
   * Regenerate invite token for a group.
   */
  regenerateInviteToken(groupId: string): Observable<Group> {
    return this.http.post<Group>(`/api/groups/${groupId}/invite-link/regenerate`, {});
  }

  /**
   * Join a group using an invite token.
   */
  joinGroup(inviteToken: string): Observable<GroupMember> {
    return this.http.post<GroupMember>(`/api/groups/join/${inviteToken}`, {});
  }

  /**
   * Fetch minimal safe metadata for an invite link.
   */
  getInviteDetails(inviteToken: string): Observable<any> {
    return this.http.get<any>(`/api/invite-links/${inviteToken}`);
  }

  /**
   * Get custom contribution percentages for a household group ledger month.
   */
  getContributions(groupId: string, month: string): Observable<any[]> {
    return this.http.get<any[]>(`/api/groups/${groupId}/contributions?month=${month}`);
  }

  /**
   * Update/save custom contribution percentages for a household group ledger month.
   */
  updateContributions(groupId: string, payload: any): Observable<any> {
    return this.http.post<any>(`/api/groups/${groupId}/contributions`, payload);
  }

  /**
   * Invite a user to a group.
   */
  inviteMember(groupId: string, payload: { email?: string; identifier?: string; role?: string }): Observable<GroupMember> {
    return this.http.post<GroupMember>(`/api/groups/${groupId}/members`, payload);
  }

  /**
   * Update membership role or join status.
   */
  updateMember(groupId: string, memberId: string, payload: { role?: string; joinStatus?: string }): Observable<GroupMember> {
    return this.http.patch<GroupMember>(`/api/groups/${groupId}/members/${memberId}`, payload);
  }

  /**
   * Remove/kick a member or revoke a pending invitation.
   */
  removeMember(groupId: string, memberId: string): Observable<void> {
    return this.http.delete<void>(`/api/groups/${groupId}/members/${memberId}`);
  }

  /**
   * Fetch pending invitations for the logged-in user.
   */
  getPendingInvitations(): Observable<any[]> {
    return this.http.get<any[]>('/api/groups/invitations/pending');
  }
}

