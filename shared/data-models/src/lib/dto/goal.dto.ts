import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsNumber,
  Min,
  IsEnum,
  IsInt,
  IsDateString,
} from 'class-validator';

export class CreateGoalDto {
  @IsString()
  @IsNotEmpty({ message: 'Goal title is required' })
  @MaxLength(160, { message: 'Goal title cannot exceed 160 characters' })
  title!: string;

  @IsNumber(
    {},
    { message: 'Target amount must be a valid numeric currency value' },
  )
  @Min(0.01, { message: 'Target amount must be greater than zero' })
  targetAmount!: number;

  @IsNumber(
    {},
    { message: 'Saved amount must be a valid numeric currency value' },
  )
  @IsOptional()
  @Min(0, { message: 'Saved amount cannot be negative' })
  savedAmount?: number;

  @IsString()
  @IsNotEmpty({ message: 'Currency code is required' })
  @MaxLength(3, { message: 'Currency code must be exactly 3 characters' })
  currency!: string;

  @IsDateString(
    {},
    { message: 'Target date must be a valid ISO date string (YYYY-MM-DD)' },
  )
  @IsOptional()
  targetDate?: string;
}

export class UpdateGoalDto {
  @IsString()
  @IsOptional()
  @MaxLength(160, { message: 'Goal title cannot exceed 160 characters' })
  title?: string;

  @IsNumber(
    {},
    { message: 'Target amount must be a valid numeric currency value' },
  )
  @Min(0.01, { message: 'Target amount must be greater than zero' })
  targetAmount?: number;

  @IsNumber(
    {},
    { message: 'Saved amount must be a valid numeric currency value' },
  )
  @IsOptional()
  @Min(0, { message: 'Saved amount cannot be negative' })
  savedAmount?: number;

  @IsString()
  @IsOptional()
  @MaxLength(3, { message: 'Currency code must be exactly 3 characters' })
  currency?: string;

  @IsDateString(
    {},
    { message: 'Target date must be a valid ISO date string (YYYY-MM-DD)' },
  )
  @IsOptional()
  targetDate?: string;

  @IsEnum(['active', 'achieved', 'paused', 'cancelled'], {
    message: 'Invalid goal status option',
  })
  @IsOptional()
  status?: 'active' | 'achieved' | 'paused' | 'cancelled';

  @IsInt({ message: 'Version must be an integer' })
  @IsNotEmpty({ message: 'Version is required to resolve concurrent edits' })
  version!: number;
}
