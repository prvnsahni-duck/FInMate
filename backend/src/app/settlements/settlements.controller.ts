import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { SettlementsService } from './settlements.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GroupRolesGuard } from '../auth/guards/group-roles.guard';
import { GroupRoles } from '../auth/decorators/group-roles.decorator';

@Controller('groups/:groupId/settlements')
@UseGuards(JwtAuthGuard, GroupRolesGuard)
export class SettlementsController {
  constructor(private readonly settlementsService: SettlementsService) {}

  @Get('balances')
  @GroupRoles('owner', 'admin', 'member', 'viewer')
  async getBalances(@Param('groupId') groupId: string, @Req() req: any) {
    return this.settlementsService.calculateGroupBalances(req.user.id, groupId);
  }
}
