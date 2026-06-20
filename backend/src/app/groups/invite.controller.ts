import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { GroupsMembershipService } from './services';

@Controller('invite-links')
export class InviteController {
  constructor(private readonly groupsMembershipService: GroupsMembershipService) {}

  @Get(':inviteToken')
  async getDetails(@Param('inviteToken', ParseUUIDPipe) inviteToken: string) {
    return this.groupsMembershipService.getInviteDetails(inviteToken);
  }
}
