import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { GroupsMembershipService } from './services';
import { SuccessResponse } from '../common/response.util';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('invite-links')
@UseGuards(JwtAuthGuard)
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
