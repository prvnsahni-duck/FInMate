import { Controller, Get, Post, Patch, Param, Body, Query, Req, UseGuards } from '@nestjs/common';
import { SettlementsService } from './settlements.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GroupRolesGuard } from '../auth/guards/group-roles.guard';
import { GroupRoles } from '../auth/decorators/group-roles.decorator';
import { ProposeSettlementDto, UpdateSettlementDto } from '@finmate/data-models';

@Controller('groups/:groupId/settlements')
@UseGuards(JwtAuthGuard, GroupRolesGuard)
export class SettlementsController {
  constructor(private readonly settlementsService: SettlementsService) {}

  @Get('balances')
  @GroupRoles('owner', 'admin', 'member', 'viewer')
  async getBalances(@Param('groupId') groupId: string, @Req() req: any) {
    return this.settlementsService.calculateGroupBalances(req.user.id, groupId);
  }

  @Post()
  @GroupRoles('owner', 'admin', 'member', 'viewer')
  async propose(
    @Param('groupId') groupId: string,
    @Body() proposeSettlementDto: ProposeSettlementDto,
    @Req() req: any,
  ) {
    return this.settlementsService.proposeSettlement(req.user.id, groupId, proposeSettlementDto);
  }

  @Get()
  @GroupRoles('owner', 'admin', 'member', 'viewer')
  async findAll(
    @Param('groupId') groupId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Req() req: any,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.settlementsService.listSettlements(req.user.id, groupId, pageNum, limitNum);
  }

  @Patch(':id')
  @GroupRoles('owner', 'admin', 'member', 'viewer')
  async update(
    @Param('groupId') groupId: string,
    @Param('id') id: string,
    @Body() updateSettlementDto: UpdateSettlementDto,
    @Req() req: any,
  ) {
    return this.settlementsService.updateSettlement(req.user.id, groupId, id, updateSettlementDto);
  }
}
