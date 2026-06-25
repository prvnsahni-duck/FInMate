import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { GroupsMembershipService } from './services';
import { SuccessResponse } from '../common/response.util';

@Controller('invite-links')
export class InviteController {
  constructor(
    private readonly groupsMembershipService: GroupsMembershipService,
  ) {}

  @Get(':inviteToken')
  async getDetails(@Param('inviteToken', ParseUUIDPipe) inviteToken: string) {
    const result =
      await this.groupsMembershipService.getInviteDetails(inviteToken);
    return new SuccessResponse(
      'Invite link details retrieved successfully',
      result,
    );
  }
}
