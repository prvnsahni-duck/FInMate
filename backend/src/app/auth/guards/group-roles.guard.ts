import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GroupMember } from '@finmate/data-models';

@Injectable()
export class GroupRolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(GroupMember)
    private readonly groupMemberRepository: Repository<GroupMember>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roles = this.reflector.get<string[]>('roles', context.getHandler());
    if (!roles || roles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const groupId = request.params.id || request.params.groupId || request.body.groupId;

    if (!user || !groupId) {
      throw new ForbiddenException({
        errorCode: 'RES_FORBIDDEN',
        message: 'Access denied: missing authentication or group scope',
      });
    }

    let membership = await this.groupMemberRepository.findOne({
      where: { group: { id: groupId }, user: { id: user.id }, joinStatus: 'active' },
    });

    if (!membership) {
      membership = await this.groupMemberRepository.findOne({
        where: { group: { id: groupId }, user: { id: user.id }, joinStatus: 'invited' },
      });

      if (!membership) {
        throw new ForbiddenException({
          errorCode: 'RES_FORBIDDEN',
          message: 'You are not a member of this group',
        });
      }

      const isSelfUpdate = request.method === 'PATCH' && request.params.memberId === membership.id;
      const isSelfRemove = request.method === 'DELETE' && request.params.memberId === membership.id;
      if (!isSelfUpdate && !isSelfRemove) {
        throw new ForbiddenException({
          errorCode: 'RES_FORBIDDEN',
          message: 'You must accept the invitation to access this group',
        });
      }
    } else {
      if (!roles.includes(membership.role)) {
        throw new ForbiddenException({
          errorCode: 'RES_FORBIDDEN',
          message: `Requires one of these group roles: ${roles.join(', ')}`,
        });
      }
    }

    request.groupMembership = membership;
    return true;
  }
}
