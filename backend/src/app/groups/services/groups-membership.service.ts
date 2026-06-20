import { Injectable } from '@nestjs/common';
import { GroupMember, InviteMemberDto, UpdateMemberDto } from '@finmate/data-models';
import { GroupsService } from '../groups.service';

@Injectable()
export class GroupsMembershipService {
  constructor(private readonly groupsService: GroupsService) {}

  async inviteMember(userId: string, groupId: string, dto: InviteMemberDto): Promise<GroupMember> {
    return this.groupsService.inviteMember(userId, groupId, dto);
  }

  async listMembers(userId: string, groupId: string): Promise<GroupMember[]> {
    return this.groupsService.listMembers(userId, groupId);
  }

  async updateMember(
    userId: string,
    groupId: string,
    memberId: string,
    dto: UpdateMemberDto,
  ): Promise<GroupMember> {
    return this.groupsService.updateMember(userId, groupId, memberId, dto);
  }

  async removeMember(userId: string, groupId: string, memberId: string): Promise<void> {
    return this.groupsService.removeMember(userId, groupId, memberId);
  }

  async getInviteDetails(inviteToken: string) {
    return this.groupsService.getInviteDetails(inviteToken);
  }

  async joinGroupByToken(userId: string, inviteToken: string): Promise<GroupMember> {
    return this.groupsService.joinGroupByToken(userId, inviteToken);
  }

  async getPendingInvitations(userId: string) {
    return this.groupsService.getPendingInvitations(userId);
  }
}

