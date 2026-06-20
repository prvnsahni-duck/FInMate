import { Injectable } from '@nestjs/common';
import { CreateGroupDto, Group, UpdateGroupDto, User } from '@finmate/data-models';
import { PaginatedResponse } from '../../common/pagination.util';
import { GroupsService } from '../groups.service';

@Injectable()
export class GroupsCrudService {
  constructor(private readonly groupsService: GroupsService) {}

  async createGroup(owner: User, dto: CreateGroupDto): Promise<Group> {
    return this.groupsService.createGroup(owner, dto);
  }

  async listGroups(
    userId: string,
    page: number,
    limit: number,
    isArchived?: boolean,
  ): Promise<PaginatedResponse<Group>> {
    return this.groupsService.listGroups(userId, page, limit, isArchived);
  }

  async findGroupById(userId: string, groupId: string): Promise<Group> {
    return this.groupsService.findGroupById(userId, groupId);
  }

  async updateGroup(userId: string, groupId: string, dto: UpdateGroupDto): Promise<Group> {
    return this.groupsService.updateGroup(userId, groupId, dto);
  }

  async regenerateInviteToken(userId: string, groupId: string): Promise<Group> {
    return this.groupsService.regenerateInviteToken(userId, groupId);
  }
}

