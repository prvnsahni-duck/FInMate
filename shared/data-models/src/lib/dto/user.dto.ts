import {
  IsBoolean,
  IsString,
  IsOptional,
  IsNotEmpty,
  MaxLength,
  IsNumber,
  Min,
} from 'class-validator';

export class UpdateProfileDto {
  @IsString()
  @IsOptional()
  @MaxLength(120, { message: 'Display name cannot exceed 120 characters' })
  displayName?: string;

  @IsString()
  @IsOptional()
  avatarUrl?: string;

  @IsString()
  @IsOptional()
  @MaxLength(10, { message: 'Locale identifier cannot exceed 10 characters' })
  locale?: string;

  @IsString()
  @IsOptional()
  @MaxLength(64, { message: 'Timezone identifier cannot exceed 64 characters' })
  timezone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(3, { message: 'Currency code must be exactly 3 characters' })
  defaultCurrency?: string;

  @IsNumber({}, { message: 'Budget limit must be a valid numeric amount' })
  @IsOptional()
  @Min(0, { message: 'Budget limit cannot be negative' })
  monthlyBudget?: number;

  @IsNumber({}, { message: 'Monthly income must be a valid numeric amount' })
  @IsOptional()
  @Min(0, { message: 'Monthly income cannot be negative' })
  monthlyIncome?: number;

  @IsBoolean({ message: 'aiOptIn must be a boolean' })
  @IsOptional()
  aiOptIn?: boolean;
}

/**
 * Store the master-key material wrapped under a client-derived recovery key.
 * Zero-knowledge: the server persists the blob only; the recovery code itself
 * exists only with the user.
 */
export class SetRecoveryKeyDto {
  @IsString()
  @IsNotEmpty({ message: 'Recovery-wrapped key blob is required' })
  recoveryWrappedKey!: string;
}
