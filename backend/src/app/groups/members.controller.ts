import { Controller, Post, Get, Patch, Delete, Body, Param, UseGuards, Req, HttpCode, HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { InviteMemberDto, UpdateMemberDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GroupRolesGuard } from '../auth/guards/group-roles.guard';
import { GroupRoles } from '../auth/decorators/group-roles.decorator';
import { GroupsMembershipService } from './services';

@Controller('groups/:id/members')
@UseGuards(JwtAuthGuard, GroupRolesGuard)
export class MembersController {
  constructor(private readonly groupsMembershipService: GroupsMembershipService) {}

  @Post()
  @GroupRoles('owner', 'admin')
  async invite(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() inviteMemberDto: InviteMemberDto,
    @Req() req: any,
  ) {
    return this.groupsMembershipService.inviteMember(req.user.id, id, inviteMemberDto);
  }

  @Get()
  @GroupRoles('owner', 'admin', 'member', 'viewer')
  async findAll(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.groupsMembershipService.listMembers(req.user.id, id);
  }

  @Patch(':memberId')
  @GroupRoles('owner', 'admin', 'member', 'viewer')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() updateMemberDto: UpdateMemberDto,
    @Req() req: any,
  ) {
    return this.groupsMembershipService.updateMember(req.user.id, id, memberId, updateMemberDto);
  }

  @Delete(':memberId')
  @GroupRoles('owner', 'admin', 'member', 'viewer')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Req() req: any,
  ) {
    await this.groupsMembershipService.removeMember(req.user.id, id, memberId);
  }
}
