import { Injectable } from '@nestjs/common';
import {
  CreateGroupDto,
  Group,
  UpdateGroupDto,
  User,
} from '@finmate/data-models';
import { PaginatedResponse } from '../../common/pagination.util';
import { GroupsService } from '../groups.service';

@Injectable()
export class GroupsCrudService {
  constructor(private readonly groupsService: GroupsService) {}

  async createGroup(
    owner: User,
    dto: CreateGroupDto,
    context?: { ip?: string; userAgent?: string },
  ): Promise<Group> {
    return this.groupsService.createGroup(owner, dto, context);
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

  async updateGroup(
    userId: string,
    groupId: string,
    dto: UpdateGroupDto,
    context?: { ip?: string; userAgent?: string },
  ): Promise<Group> {
    return this.groupsService.updateGroup(userId, groupId, dto, context);
  }

  async regenerateInviteToken(userId: string, groupId: string): Promise<Group> {
    return this.groupsService.regenerateInviteToken(userId, groupId);
  }

  async archiveGroup(
    userId: string,
    groupId: string,
    reason?: string,
    context?: { ip?: string; userAgent?: string },
  ): Promise<Group> {
    return this.groupsService.archiveGroup(userId, groupId, reason, context);
  }
}
