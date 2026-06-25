import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { SettlementsService } from './settlements.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SuccessResponse } from '../common/response.util';

@Controller('friends')
@UseGuards(JwtAuthGuard)
export class FriendsController {
  constructor(private readonly settlementsService: SettlementsService) {}

  @Get()
  async getFriendsBalances(@Req() req: any) {
    const result = await this.settlementsService.calculateFriendsBalances(
      req.user.id,
    );
    return new SuccessResponse(
      'Friends balances calculated successfully',
      result,
    );
  }
}
