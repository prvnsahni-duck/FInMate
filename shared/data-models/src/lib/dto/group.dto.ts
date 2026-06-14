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

  /** Group type: `normal` (default) or `household` (month-based ledger). */
  @IsEnum(['normal', 'household'], { message: 'Invalid group type. Must be normal or household' })
  @IsOptional()
  groupType?: 'normal' | 'household';

  /**
   * Household-only: whether to carry forward extra-paid balance at month close.
   * Ignored for normal groups.
   */
  @IsBoolean()
  @IsOptional()
  carryForwardEnabled?: boolean;
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

  /** Toggle carry-forward for household groups. */
  @IsBoolean()
  @IsOptional()
  carryForwardEnabled?: boolean;

  @IsInt({ message: 'Version must be an integer' })
  @IsNotEmpty({ message: 'Version is required to resolve concurrent edits' })
  version!: number;
}

export class InviteMemberDto {
  @IsEmail({}, { message: 'Must invite user via a valid email address' })
  @IsNotEmpty({ message: 'Member email is required' })
  email!: string;

  /**
   * Role for the invited member.
   * - `spectator`: can create/update expenses but is excluded from all splits.
   */
  @IsEnum(['admin', 'member', 'viewer', 'spectator'], { message: 'Invalid member role option' })
  @IsOptional()
  role?: 'admin' | 'member' | 'viewer' | 'spectator';
}

export class UpdateMemberDto {
  @IsEnum(['owner', 'admin', 'member', 'viewer', 'spectator'], { message: 'Invalid member role option' })
  @IsOptional()
  role?: 'owner' | 'admin' | 'member' | 'viewer' | 'spectator';

  @IsEnum(['invited', 'active', 'left', 'removed'], { message: 'Invalid member join status option' })
  @IsOptional()
  joinStatus?: 'invited' | 'active' | 'left' | 'removed';
}
