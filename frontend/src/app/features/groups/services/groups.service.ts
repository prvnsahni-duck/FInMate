import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
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

@Injectable({
  providedIn: 'root'
})
export class GroupsService {
  private http = inject(HttpClient);

  /**
   * Fetch all active groups.
   */
  getGroups(): Observable<PaginatedResponse<Group>> {
    return this.http.get<PaginatedResponse<Group>>('/api/groups');
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
  createGroup(groupData: CreateGroupDto): Observable<Group> {
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
  getCarryForward(groupId: string, month: string): Observable<CarryForwardBalance[]> {
    return this.http.get<CarryForwardBalance[]>(`/api/groups/${groupId}/carry-forward?month=${month}`);
  }

  /**
   * Update an existing group.
   */
  updateGroup(groupId: string, groupData: UpdateGroupDto): Observable<Group> {
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
  getInviteDetails(inviteToken: string): Observable<InviteDetailsResponse> {
    return this.http.get<InviteDetailsResponse>(`/api/invite-links/${inviteToken}`);
  }

  /**
   * Get custom contribution percentages for a household group ledger month.
   */
  getContributions(groupId: string, month: string): Observable<GroupContributionResponse[]> {
    return this.http.get<GroupContributionResponse[]>(`/api/groups/${groupId}/contributions?month=${month}`);
  }

  /**
   * Update/save custom contribution percentages for a household group ledger month.
   */
  updateContributions(groupId: string, payload: UpdateContributionDto | UpdateContributionsPayload): Observable<GroupContributionResponse[]> {
    return this.http.post<GroupContributionResponse[]>(`/api/groups/${groupId}/contributions`, payload);
  }

  /**
   * Invite a user to a group.
   */
  inviteMember(groupId: string, payload: { email?: string; identifier?: string; role?: string; displayName?: string }): Observable<GroupMember> {
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
  getPendingInvitations(): Observable<PendingInvitationResponse[]> {
    return this.http.get<PendingInvitationResponse[]>('/api/groups/invitations/pending');
  }
}

