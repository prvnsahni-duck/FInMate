import { Controller, Post, Get, Patch, Body, Query, Param, UseGuards, Req } from '@nestjs/common';
import { CreateGroupDto, UpdateGroupDto } from '@finmate/data-models';
import { GroupsService } from './groups.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('groups')
@UseGuards(JwtAuthGuard)
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Post()
  async create(@Body() createGroupDto: CreateGroupDto, @Req() req: any) {
    return this.groupsService.createGroup(req.user, createGroupDto);
  }

  @Get()
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('isArchived') isArchived?: string,
    @Req() req?: any,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    const isArchivedBool = isArchived === 'true' ? true : isArchived === 'false' ? false : undefined;

    return this.groupsService.listGroups(req.user.id, pageNum, limitNum, isArchivedBool);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: any) {
    return this.groupsService.findGroupById(req.user.id, id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateGroupDto: UpdateGroupDto,
    @Req() req: any,
  ) {
    return this.groupsService.updateGroup(req.user.id, id, updateGroupDto);
  }
}
