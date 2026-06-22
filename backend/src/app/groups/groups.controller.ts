import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Query,
  Param,
  UseGuards,
  Req,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { CreateGroupDto, UpdateContributionDto, UpdateGroupDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ExpensesCarryForwardService } from '../expenses/services';
import {
  GroupsAuditService,
  GroupsContributionsService,
  GroupsCrudService,
  GroupsMembershipService,
} from './services';
import { SuccessResponse } from '../common/response.util';

@Controller('groups')
@UseGuards(JwtAuthGuard)
export class GroupsController {
  constructor(
    private readonly groupsCrudService: GroupsCrudService,
    private readonly groupsMembershipService: GroupsMembershipService,
    private readonly groupsAuditService: GroupsAuditService,
    private readonly groupsContributionsService: GroupsContributionsService,
    private readonly expensesCarryForwardService: ExpensesCarryForwardService,
  ) {}

  @Post()
  async create(
    @Body() createGroupDto: CreateGroupDto,
    @Req() req: Request & { user: { id: string } & Record<string, unknown> },
  ) {
    const result = await this.groupsCrudService.createGroup(req.user as unknown as Parameters<typeof this.groupsCrudService.createGroup>[0], createGroupDto);
    return new SuccessResponse('Group created successfully', result);
  }


  @Get()
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('isArchived') isArchived?: string,
    @Req() req?: Request & { user: { id: string } },
  ) {
    let pageNum = page ? parseInt(page, 10) : 1;
    let limitNum = limit ? parseInt(limit, 10) : 20;
    if (isNaN(pageNum) || pageNum <= 0) pageNum = 1;
    if (isNaN(limitNum) || limitNum <= 0) limitNum = 20;
    const isArchivedBool = isArchived === 'true' ? true : isArchived === 'false' ? false : undefined;

    const result = await this.groupsCrudService.listGroups(req!.user.id, pageNum, limitNum, isArchivedBool);
    return new SuccessResponse('Groups retrieved successfully', result);
  }

  @Post('join/:inviteToken')
  async joinGroupByToken(
    @Param('inviteToken', ParseUUIDPipe) inviteToken: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    const result = await this.groupsMembershipService.joinGroupByToken(req.user.id, inviteToken);
    return new SuccessResponse('Joined group successfully', result);
  }

  @Get('invitations/pending')
  async findPendingInvitations(@Req() req: Request & { user: { id: string } }) {
    const result = await this.groupsMembershipService.getPendingInvitations(req.user.id);
    return new SuccessResponse('Pending group invitations retrieved successfully', result);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    const result = await this.groupsCrudService.findGroupById(req.user.id, id);
    return new SuccessResponse('Group retrieved successfully', result);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateGroupDto: UpdateGroupDto,
    @Req() req: Request & { user: { id: string } },
  ) {
    const result = await this.groupsCrudService.updateGroup(req.user.id, id, updateGroupDto);
    return new SuccessResponse('Group updated successfully', result);
  }

  @Post(':id/invite-link/regenerate')
  async regenerateInviteToken(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    const result = await this.groupsCrudService.regenerateInviteToken(req.user.id, id);
    return new SuccessResponse('Invite token regenerated successfully', result);
  }

  // ─── Group History ────────────────────────────────────────────────────────

  /**
   * Get the audit history for a group (expense create/update/delete/restore events).
   * All active group members can view the history.
   */
  @Get(':id/history')
  async getHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Req() req: Request & { user: { id: string } },
  ) {
    const result = await this.groupsAuditService.getGroupHistory(req.user.id, id, page, limit);
    return new SuccessResponse('Group history retrieved successfully', result);
  }

  /**
   * List soft-deleted expenses for the group (for group history / restore UI).
   */
  @Get(':id/expenses/deleted')
  async findDeleted(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Req() req: Request & { user: { id: string } },
  ) {
    const result = await this.expensesCarryForwardService.listDeletedExpenses(req.user.id, id, page, limit);
    return new SuccessResponse('Deleted expenses retrieved successfully', result);
  }

  // ─── Carry-Forward Summary ────────────────────────────────────────────────

  /**
   * Get the household carry-forward balance summary for a specific ledger month.
   * Only available for `household` type groups.
   */
  @Get(':id/carry-forward')
  async getCarryForward(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('month') month: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    // Default to current month if not provided
    const ledgerMonth = month ?? new Date().toISOString().slice(0, 7);
    const result = await this.expensesCarryForwardService.getCarryForwardSummary(req.user.id, id, ledgerMonth);
    return new SuccessResponse('Carry-forward summary retrieved successfully', result);
  }

  @Get(':id/contributions')
  async getContributions(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('month') month: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    const ledgerMonth = month ?? new Date().toISOString().slice(0, 7);
    const result = await this.groupsContributionsService.getContributions(req.user.id, id, ledgerMonth);
    return new SuccessResponse('Group contribution shares retrieved successfully', result);
  }

  @Post(':id/contributions')
  async updateContributions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContributionDto,
    @Req() req: Request & { user: { id: string } },
  ) {
    const result = await this.groupsContributionsService.updateContributions(req.user.id, id, dto);
    return new SuccessResponse('Group contribution shares updated successfully', result);
  }
}
