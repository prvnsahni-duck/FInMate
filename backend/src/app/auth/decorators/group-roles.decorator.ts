import { SetMetadata } from '@nestjs/common';

export const GroupRoles = (...roles: ('owner' | 'admin' | 'member' | 'viewer')[]) => SetMetadata('roles', roles);
