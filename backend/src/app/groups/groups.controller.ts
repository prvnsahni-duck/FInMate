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
import { CreateGroupDto, UpdateGroupDto } from '@finmate/data-models';
import { GroupsService } from './groups.service';
import { ExpensesService } from '../expenses/expenses.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('groups')
@UseGuards(JwtAuthGuard)
export class GroupsController {
  constructor(
    private readonly groupsService: GroupsService,
    private readonly expensesService: ExpensesService,
  ) {}

  @Post()
  async create(
    @Body() createGroupDto: CreateGroupDto,
    @Req() req: Request & { user: { id: string } & Record<string, unknown> },
  ) {
    // req.user is typed narrowly by JwtAuthGuard; cast to User is safe here
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.groupsService.createGroup(req.user as unknown as Parameters<typeof this.groupsService.createGroup>[0], createGroupDto);
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

    return this.groupsService.listGroups(req!.user.id, pageNum, limitNum, isArchivedBool);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.groupsService.findGroupById(req.user.id, id);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateGroupDto: UpdateGroupDto,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.groupsService.updateGroup(req.user.id, id, updateGroupDto);
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
    return this.groupsService.getGroupHistory(req.user.id, id, page, limit);
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
    return this.expensesService.getCarryForwardSummary(req.user.id, id, ledgerMonth);
  }
}
