import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { SettlementsService } from './settlements.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('friends')
@UseGuards(JwtAuthGuard)
export class FriendsController {
  constructor(private readonly settlementsService: SettlementsService) {}

  @Get()
  async getFriendsBalances(@Req() req: any) {
    return this.settlementsService.calculateFriendsBalances(req.user.id);
  }
}
