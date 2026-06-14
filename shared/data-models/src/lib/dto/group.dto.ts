import { IsString, IsNotEmpty, MaxLength, IsOptional, IsEnum, IsBoolean, IsInt, IsEmail } from 'class-validator';

export class CreateGroupDto {
  @IsString()
  @IsNotEmpty({ message: 'Group name is required' })
  @MaxLength(120, { message: 'Group name cannot exceed 120 characters' })
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(['private', 'invite_only', 'public_readonly'], { message: 'Invalid group visibility option' })
  @IsOptional()
  visibility?: 'private' | 'invite_only' | 'public_readonly';

  @IsString()
  @IsOptional()
  @MaxLength(3, { message: 'Currency code must be a 3-character ISO code' })
  currency?: string;
}

export class UpdateGroupDto {
  @IsString()
  @IsOptional()
  @MaxLength(120, { message: 'Group name cannot exceed 120 characters' })
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(['private', 'invite_only', 'public_readonly'], { message: 'Invalid group visibility option' })
  @IsOptional()
  visibility?: 'private' | 'invite_only' | 'public_readonly';

  @IsBoolean()
  @IsOptional()
  isArchived?: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(3, { message: 'Currency code must be a 3-character ISO code' })
  currency?: string;

  @IsInt({ message: 'Version must be an integer' })
  @IsNotEmpty({ message: 'Version is required to resolve concurrent edits' })
  version!: number;
}

export class InviteMemberDto {
  @IsEmail({}, { message: 'Must invite user via a valid email address' })
  @IsNotEmpty({ message: 'Member email is required' })
  email!: string;

  @IsEnum(['admin', 'member', 'viewer'], { message: 'Invalid member role option' })
  @IsOptional()
  role?: 'admin' | 'member' | 'viewer';
}

export class UpdateMemberDto {
  @IsEnum(['owner', 'admin', 'member', 'viewer'], { message: 'Invalid member role option' })
  @IsOptional()
  role?: 'owner' | 'admin' | 'member' | 'viewer';

  @IsEnum(['invited', 'active', 'left', 'removed'], { message: 'Invalid member join status option' })
  @IsOptional()
  joinStatus?: 'invited' | 'active' | 'left' | 'removed';
}
