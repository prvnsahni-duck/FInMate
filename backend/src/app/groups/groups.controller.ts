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
  BadRequestException,
  ForbiddenException,
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
import { InjectRepository } from '@nestjs/typeorm';
import { EncryptedGroupKey, GroupMember } from '@finmate/data-models';
import { In, Repository } from 'typeorm';

@Controller('groups')
@UseGuards(JwtAuthGuard)
export class GroupsController {
  constructor(
    private readonly groupsCrudService: GroupsCrudService,
    private readonly groupsMembershipService: GroupsMembershipService,
    private readonly groupsAuditService: GroupsAuditService,
    private readonly groupsContributionsService: GroupsContributionsService,
    private readonly expensesCarryForwardService: ExpensesCarryForwardService,
    @InjectRepository(EncryptedGroupKey)
    private readonly encryptedGroupKeyRepository: Repository<EncryptedGroupKey>,
    @InjectRepository(GroupMember)
    private readonly groupMemberRepository: Repository<GroupMember>,
  ) {}

  @Post()
  async create(
    @Body() createGroupDto: CreateGroupDto,
    @Req()
    req: Request & {
      user: { id: string } & Record<string, unknown>;
      ip?: string;
      socket: { remoteAddress?: string };
    },
  ) {
    const context = {
      ip:
        req.ip ||
        (req.headers['x-forwarded-for'] as string) ||
        req.socket.remoteAddress,
      userAgent: req.headers['user-agent'] as string,
    };
    const result = await this.groupsCrudService.createGroup(
      req.user as unknown as Parameters<
        typeof this.groupsCrudService.createGroup
      >[0],
      createGroupDto,
      context,
    );
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
    const isArchivedBool =
      isArchived === 'true' ? true : isArchived === 'false' ? false : undefined;

    const result = await this.groupsCrudService.listGroups(
      req!.user.id,
      pageNum,
      limitNum,
      isArchivedBool,
    );
    return new SuccessResponse('Groups retrieved successfully', result);
  }

  @Post('join/:inviteToken')
  async joinGroupByToken(
    @Param('inviteToken', ParseUUIDPipe) inviteToken: string,
    @Req()
    req: Request & {
      user: { id: string };
      ip?: string;
      socket: { remoteAddress?: string };
    },
  ) {
    const context = {
      ip:
        req.ip ||
        (req.headers['x-forwarded-for'] as string) ||
        req.socket.remoteAddress,
      userAgent: req.headers['user-agent'] as string,
    };
    const result = await this.groupsMembershipService.joinGroupByToken(
      req.user.id,
      inviteToken,
      context,
    );
    return new SuccessResponse('Joined group successfully', result);
  }

  @Get('invitations/pending')
  async findPendingInvitations(@Req() req: Request & { user: { id: string } }) {
    const result = await this.groupsMembershipService.getPendingInvitations(
      req.user.id,
    );
    return new SuccessResponse(
      'Pending group invitations retrieved successfully',
      result,
    );
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
    @Req()
    req: Request & {
      user: { id: string };
      ip?: string;
      socket: { remoteAddress?: string };
    },
  ) {
    const context = {
      ip:
        req.ip ||
        (req.headers['x-forwarded-for'] as string) ||
        req.socket.remoteAddress,
      userAgent: req.headers['user-agent'] as string,
    };
    const result = await this.groupsCrudService.updateGroup(
      req.user.id,
      id,
      updateGroupDto,
      context,
    );
    return new SuccessResponse('Group updated successfully', result);
  }

  @Post(':id/invite-link/regenerate')
  async regenerateInviteToken(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    const result = await this.groupsCrudService.regenerateInviteToken(
      req.user.id,
      id,
    );
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
    const result = await this.groupsAuditService.getGroupHistory(
      req.user.id,
      id,
      page,
      limit,
    );
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
    const result = await this.expensesCarryForwardService.listDeletedExpenses(
      req.user.id,
      id,
      page,
      limit,
    );
    return new SuccessResponse(
      'Deleted expenses retrieved successfully',
      result,
    );
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
    const result =
      await this.expensesCarryForwardService.getCarryForwardSummary(
        req.user.id,
        id,
        ledgerMonth,
      );
    return new SuccessResponse(
      'Carry-forward summary retrieved successfully',
      result,
    );
  }

  @Post(':id/close-month')
  async closeMonth(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { ledgerMonth: string },
    @Req() req: Request & { user: { id: string } },
  ) {
    if (!body || !body.ledgerMonth) {
      throw new BadRequestException('ledgerMonth is required');
    }
    const result = await this.expensesCarryForwardService.closeMonth(
      req.user.id,
      id,
      body.ledgerMonth,
    );
    return new SuccessResponse(
      'Billing month closed and carry-forward balances rolled over successfully',
      result,
    );
  }

  @Get(':id/contributions')
  async getContributions(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('month') month: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    const ledgerMonth = month ?? new Date().toISOString().slice(0, 7);
    const result = await this.groupsContributionsService.getContributions(
      req.user.id,
      id,
      ledgerMonth,
    );
    return new SuccessResponse(
      'Group contribution shares retrieved successfully',
      result,
    );
  }

  @Post(':id/contributions')
  async updateContributions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContributionDto,
    @Req() req: Request & { user: { id: string } },
  ) {
    const result = await this.groupsContributionsService.updateContributions(
      req.user.id,
      id,
      dto,
    );
    return new SuccessResponse(
      'Group contribution shares updated successfully',
      result,
    );
  }

  // ─── Group Encryption Keys ──────────────────────────────────────────────

  /**
   * Provision wrapped group data keys for one or more members.
   * The caller must be an active member with the group key loaded.
   */
  @Post(':id/keys')
  async provisionGroupKeys(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { keys: Array<{ userId: string; wrappedKey: string }> },
    @Req() req: Request & { user: { id: string } },
  ) {
    // Verify caller is an active member. Only owner/admin can provision keys
    // for other members; users may only create/update their own wrapped key.
    const callerMember = await this.groupMemberRepository.findOne({
      where: {
        group: { id },
        user: { id: req.user.id },
        joinStatus: 'active',
      },
    });
    if (!callerMember) {
      throw new BadRequestException('You do not have access to this group');
    }

    if (!body.keys || !Array.isArray(body.keys) || body.keys.length === 0) {
      throw new BadRequestException('keys must be a non-empty array');
    }

    for (const entry of body.keys) {
      const isSelfProvision = entry.userId === req.user.id;
      const canProvisionOthers =
        callerMember.role === 'owner' || callerMember.role === 'admin';

      if (!isSelfProvision && !canProvisionOthers) {
        throw new ForbiddenException(
          'Only owners and admins can provision group keys for other members',
        );
      }

      // Verify target user is a member of the group
      const targetMember = await this.groupMemberRepository.findOne({
        where: {
          group: { id },
          user: { id: entry.userId },
          joinStatus: In(['active', 'invited']),
        },
      });
      if (!targetMember) {
        continue; // Skip non-members silently
      }

      // Upsert: update if exists, insert if not
      const existing = await this.encryptedGroupKeyRepository.findOne({
        where: { group: { id }, user: { id: entry.userId } },
      });
      if (existing) {
        existing.wrappedKey = entry.wrappedKey;
        await this.encryptedGroupKeyRepository.save(existing);
      } else {
        await this.encryptedGroupKeyRepository.save(
          this.encryptedGroupKeyRepository.create({
            group: { id } as any,
            user: { id: entry.userId } as any,
            wrappedKey: entry.wrappedKey,
          }),
        );
      }
    }

    return new SuccessResponse('Group keys provisioned successfully', null);
  }

  /**
   * Get the caller's wrapped group data key.
   */
  @Get(':id/keys/me')
  async getMyGroupKey(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    // Verify caller is a member
    const callerMember = await this.groupMemberRepository.findOne({
      where: {
        group: { id },
        user: { id: req.user.id },
        joinStatus: 'active',
      },
    });
    if (!callerMember) {
      throw new BadRequestException('You do not have access to this group');
    }

    const key = await this.encryptedGroupKeyRepository.findOne({
      where: { group: { id }, user: { id: req.user.id } },
    });

    return new SuccessResponse('Group key retrieved', {
      groupId: id,
      userId: req.user.id,
      wrappedKey: key?.wrappedKey ?? null,
    });
  }

  /**
   * Get list of user IDs in the group who do not have a wrapped group key yet.
   */
  @Get(':id/keys/missing')
  async getMissingKeys(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ) {
    const callerMember = await this.groupMemberRepository.findOne({
      where: {
        group: { id },
        user: { id: req.user.id },
        joinStatus: 'active',
      },
    });
    if (!callerMember) {
      throw new BadRequestException('You do not have access to this group');
    }
    if (callerMember.role !== 'owner' && callerMember.role !== 'admin') {
      throw new ForbiddenException(
        'Only owners and admins can inspect missing group keys',
      );
    }

    const members = await this.groupMemberRepository.find({
      where: { group: { id }, joinStatus: In(['active', 'invited']) },
      relations: ['user'],
    });

    const existingKeys = await this.encryptedGroupKeyRepository.find({
      where: { group: { id } },
      relations: ['user'],
    });

    const existingUserIds = new Set(existingKeys.map((k) => k.user?.id).filter(Boolean));
    const missingUserIds = members
      .map((m) => m.user?.id)
      .filter((uid): uid is string => !!uid && !existingUserIds.has(uid));

    return new SuccessResponse('Missing keys retrieved', missingUserIds);
  }
}
