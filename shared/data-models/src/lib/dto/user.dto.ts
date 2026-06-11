import { IsString, IsOptional, MaxLength, IsNumber, Min } from 'class-validator';

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
}
