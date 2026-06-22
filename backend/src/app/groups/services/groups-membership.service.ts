import { Injectable } from '@nestjs/common';
import { GroupMember, InviteMemberDto, UpdateMemberDto } from '@finmate/data-models';
import { GroupsService } from '../groups.service';

@Injectable()
export class GroupsMembershipService {
  constructor(private readonly groupsService: GroupsService) {}

  async inviteMember(userId: string, groupId: string, dto: InviteMemberDto, context?: { ip?: string; userAgent?: string }): Promise<GroupMember> {
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
    return this.groupsService.updateMember(userId, groupId, memberId, dto, context);
  }

  async removeMember(userId: string, groupId: string, memberId: string, context?: { ip?: string; userAgent?: string }): Promise<void> {
    return this.groupsService.removeMember(userId, groupId, memberId, context);
  }

  async getInviteDetails(inviteToken: string) {
    return this.groupsService.getInviteDetails(inviteToken);
  }

  async joinGroupByToken(userId: string, inviteToken: string, context?: { ip?: string; userAgent?: string }): Promise<GroupMember> {
    return this.groupsService.joinGroupByToken(userId, inviteToken, context);
  }

  async getPendingInvitations(userId: string) {
    return this.groupsService.getPendingInvitations(userId);
  }
}

