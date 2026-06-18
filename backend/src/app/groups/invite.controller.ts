import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { GroupsService } from './groups.service';

@Controller('invite-links')
export class InviteController {
  constructor(private readonly groupsService: GroupsService) {}

  @Get(':inviteToken')
  async getDetails(@Param('inviteToken', ParseUUIDPipe) inviteToken: string) {
    return this.groupsService.getInviteDetails(inviteToken);
  }
}
