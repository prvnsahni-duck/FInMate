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
    // req.user is typed narrowly by JwtAuthGuard; cast to User is safe here
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.groupsCrudService.createGroup(req.user as unknown as Parameters<typeof this.groupsCrudService.createGroup>[0], createGroupDto);
  }


  @Get()
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('isArchived') isArchived?: string,
    @Req() req?: Request & { user: { id: string } },
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    const isArchivedBool = isArchived === 'true' ? true : isArchived === 'false' ? false : undefined;

    return this.groupsCrudService.listGroups(req!.user.id, pageNum, limitNum, isArchivedBool);
  }

  @Post('join/:inviteToken')
  async joinGroupByToken(
    @Param('inviteToken', ParseUUIDPipe) inviteToken: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.groupsMembershipService.joinGroupByToken(req.user.id, inviteToken);
  }

  @Get('invitations/pending')
  async findPendingInvitations(@Req() req: Request & { user: { id: string } }) {
    return this.groupsMembershipService.getPendingInvitations(req.user.id);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.groupsCrudService.findGroupById(req.user.id, id);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateGroupDto: UpdateGroupDto,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.groupsCrudService.updateGroup(req.user.id, id, updateGroupDto);
  }

  @Post(':id/invite-link/regenerate')
  async regenerateInviteToken(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.groupsCrudService.regenerateInviteToken(req.user.id, id);
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
    return this.groupsAuditService.getGroupHistory(req.user.id, id, page, limit);
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
    return this.expensesCarryForwardService.listDeletedExpenses(req.user.id, id, page, limit);
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
    return this.expensesCarryForwardService.getCarryForwardSummary(req.user.id, id, ledgerMonth);
  }

  @Get(':id/contributions')
  async getContributions(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('month') month: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    const ledgerMonth = month ?? new Date().toISOString().slice(0, 7);
    return this.groupsContributionsService.getContributions(req.user.id, id, ledgerMonth);
  }

  @Post(':id/contributions')
  async updateContributions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContributionDto,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.groupsContributionsService.updateContributions(req.user.id, id, dto);
  }
}
