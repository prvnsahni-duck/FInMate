import { Injectable } from '@nestjs/common';
import { PaginatedResponse } from '../../common/pagination.util';
import { GroupsService } from '../groups.service';

@Injectable()
export class GroupsAuditService {
  constructor(private readonly groupsService: GroupsService) {}

  async getGroupHistory(
    userId: string,
    groupId: string,
    page: number,
    limit: number,
    range?: { from?: string; to?: string },
  ): Promise<PaginatedResponse<Record<string, unknown>>> {
    return this.groupsService.getGroupHistory(
      userId,
      groupId,
      page,
      limit,
      range,
    );
  }
}
