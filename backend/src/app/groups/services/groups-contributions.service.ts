import { Injectable } from '@nestjs/common';
import { UpdateContributionDto } from '@finmate/data-models';
import { GroupsService } from '../groups.service';

@Injectable()
export class GroupsContributionsService {
  constructor(private readonly groupsService: GroupsService) {}

  async getContributions(userId: string, groupId: string, ledgerMonth: string) {
    return this.groupsService.getContributions(userId, groupId, ledgerMonth);
  }

  async updateContributions(userId: string, groupId: string, dto: UpdateContributionDto) {
    return this.groupsService.updateContributions(userId, groupId, dto);
  }
}

