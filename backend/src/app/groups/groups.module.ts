import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Group, GroupMember } from '@finmate/data-models';
import { GroupsService } from './groups.service';
import { GroupsController } from './groups.controller';
import { MembersController } from './members.controller';
import { GroupRolesGuard } from '../auth/guards/group-roles.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Group, GroupMember])],
  controllers: [GroupsController, MembersController],
  providers: [GroupsService, GroupRolesGuard],
  exports: [GroupsService],
})
export class GroupsModule {}
