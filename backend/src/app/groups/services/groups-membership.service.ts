import { Injectable } from '@nestjs/common';
import {
  GroupMember,
  InviteMemberDto,
  RotateGroupKeyDto,
  UpdateMemberDto,
} from '@finmate/data-models';
import { GroupsService } from '../groups.service';

@Injectable()
export class GroupsMembershipService {
  constructor(private readonly groupsService: GroupsService) {}

  async inviteMember(
    userId: string,
    groupId: string,
    dto: InviteMemberDto,
    context?: { ip?: string; userAgent?: string },
  ): Promise<any> {
    return this.groupsService.inviteMember(userId, groupId, dto, context);
  }

  async listMembers(userId: string, groupId: string): Promise<GroupMember[]> {
    return this.groupsService.listMembers(userId, groupId);
  }

  async updateMember(
    userId: string,
    groupId: string,
    memberId: string,
    dto: UpdateMemberDto,
    context?: { ip?: string; userAgent?: string },
  ): Promise<GroupMember> {
    return this.groupsService.updateMember(
      userId,
      groupId,
      memberId,
      dto,
      context,
    );
  }

  async removeMember(
    userId: string,
    groupId: string,
    memberId: string,
    context?: { ip?: string; userAgent?: string },
  ): Promise<void> {
    return this.groupsService.removeMember(userId, groupId, memberId, context);
  }

  async getInviteDetails(inviteToken: string) {
    return this.groupsService.getInviteDetails(inviteToken);
  }

  async joinGroupByToken(
    userId: string,
    inviteToken: string,
    context?: { ip?: string; userAgent?: string },
  ): Promise<GroupMember> {
    return this.groupsService.joinGroupByToken(userId, inviteToken, context);
  }

  async getPendingInvitations(userId: string) {
    return this.groupsService.getPendingInvitations(userId);
  }

  async createGroupInvite(
    userId: string,
    groupId: string,
    dto: { wrappedGroupKey?: string },
  ) {
    return this.groupsService.createGroupInvite(userId, groupId, dto);
  }

  async provisionGroupKeys(
    userId: string,
    groupId: string,
    keys: Array<{ userId: string; wrappedKey: string }>,
  ): Promise<void> {
    return this.groupsService.provisionGroupKeys(userId, groupId, keys);
  }

  async getMyGroupKey(userId: string, groupId: string, versionId?: string) {
    return this.groupsService.getMyGroupKey(userId, groupId, versionId);
  }

  async getMissingGroupKeys(userId: string, groupId: string): Promise<string[]> {
    return this.groupsService.getMissingGroupKeys(userId, groupId);
  }

  async listGroupKeyVersions(userId: string, groupId: string) {
    return this.groupsService.listGroupKeyVersions(userId, groupId);
  }

  async rotateGroupKey(userId: string, groupId: string, dto: RotateGroupKeyDto) {
    return this.groupsService.rotateGroupKey(userId, groupId, dto);
  }
}
