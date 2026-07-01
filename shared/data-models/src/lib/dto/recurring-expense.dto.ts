import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  IsUUID,
  IsArray,
  ValidateNested,
  IsInt,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsCiphertext } from './is-ciphertext.decorator';

export class RecurringExpenseSplitInputDto {
  @IsUUID('4', { message: 'Participant User ID must be a valid UUID v4' })
  @IsOptional()
  participantUserId?: string;

  @IsUUID('4', {
    message: 'Participant Group Member ID must be a valid UUID v4',
  })
  @IsOptional()
  participantGroupMemberId?: string;

  @IsEnum(['equal', 'fixed', 'percent', 'share'], {
    message: 'Invalid split algorithm type',
  })
  @IsNotEmpty({ message: 'Split type is required' })
  splitType!: 'equal' | 'fixed' | 'percent' | 'share';

  @IsNumber(
    {},
    { message: 'Share value must be a valid numeric calculation decimal' },
  )
  @Min(0, { message: 'Share value cannot be negative' })
  shareValue!: number;
}

export class CreateRecurringExpenseDto {
  @IsString()
  @IsNotEmpty({ message: 'Expense title is required' })
  @MaxLength(1000, { message: 'Expense title cannot exceed 1000 characters' })
  @IsCiphertext({
    message: 'Expense title could not be processed securely. Please try again.',
  })
  title!: string;

  @IsString()
  @IsOptional()
  @IsCiphertext({
    message:
      'Expense description could not be processed securely. Please try again.',
  })
  description?: string;

  @IsNumber(
    {},
    { message: 'Total amount must be a valid numeric currency value' },
  )
  @Min(0.01, { message: 'Total amount must be greater than zero' })
  amountTotal!: number;

  @IsString()
  @IsNotEmpty({ message: 'Currency code is required' })
  @MaxLength(3, { message: 'Currency code must be exactly 3 characters' })
  currency!: string;

  @IsString()
  @IsNotEmpty({ message: 'Expense category is required' })
  @MaxLength(64, { message: 'Expense category cannot exceed 64 characters' })
  category!: string;

  @IsUUID('4', { message: 'Paid-by User ID must be a valid UUID' })
  @IsNotEmpty({ message: 'Payer ID is required' })
  paidByUserId!: string;

  @IsUUID('4', { message: 'Group ID must be a valid UUID' })
  @IsOptional()
  groupId?: string;

  @IsEnum(['daily', 'weekly', 'monthly', 'yearly'], {
    message: 'Invalid frequency option',
  })
  @IsNotEmpty({ message: 'Frequency is required' })
  frequency!: 'daily' | 'weekly' | 'monthly' | 'yearly';

  @IsDateString(
    {},
    { message: 'Start date must be a valid ISO date string (YYYY-MM-DD)' },
  )
  @IsNotEmpty({ message: 'Start date is required' })
  startDate!: string;

  @IsDateString(
    {},
    { message: 'End date must be a valid ISO date string (YYYY-MM-DD)' },
  )
  @IsOptional()
  endDate?: string;

  @IsArray({ message: 'Splits must be a valid collection array' })
  @ValidateNested({ each: true })
  @Type(() => RecurringExpenseSplitInputDto)
  splits!: RecurringExpenseSplitInputDto[];
}

export class UpdateRecurringExpenseDto {
  @IsString()
  @IsOptional()
  @MaxLength(1000, { message: 'Expense title cannot exceed 1000 characters' })
  @IsCiphertext({
    message: 'Expense title could not be processed securely. Please try again.',
  })
  title?: string;

  @IsString()
  @IsOptional()
  @IsCiphertext({
    message:
      'Expense description could not be processed securely. Please try again.',
  })
  description?: string;

  @IsNumber(
    {},
    { message: 'Total amount must be a valid numeric currency value' },
  )
  @Min(0.01, { message: 'Total amount must be greater than zero' })
  amountTotal?: number;

  @IsString()
  @IsOptional()
  @MaxLength(3, { message: 'Currency code must be exactly 3 characters' })
  currency?: string;

  @IsString()
  @IsOptional()
  @MaxLength(64, { message: 'Expense category cannot exceed 64 characters' })
  category?: string;

  @IsUUID('4', { message: 'Paid-by User ID must be a valid UUID' })
  @IsOptional()
  paidByUserId?: string;

  @IsEnum(['daily', 'weekly', 'monthly', 'yearly'], {
    message: 'Invalid frequency option',
  })
  @IsOptional()
  frequency?: 'daily' | 'weekly' | 'monthly' | 'yearly';

  @IsDateString(
    {},
    { message: 'Start date must be a valid ISO date string (YYYY-MM-DD)' },
  )
  @IsOptional()
  startDate?: string;

  @IsDateString(
    {},
    { message: 'End date must be a valid ISO date string (YYYY-MM-DD)' },
  )
  @IsOptional()
  endDate?: string;

  @IsEnum(['active', 'paused', 'completed'], {
    message: 'Invalid status option',
  })
  @IsOptional()
  status?: 'active' | 'paused' | 'completed';

  @IsArray({ message: 'Splits must be a valid collection array' })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => RecurringExpenseSplitInputDto)
  splits?: RecurringExpenseSplitInputDto[];

  @IsInt({ message: 'Version must be an integer' })
  @IsNotEmpty({ message: 'Version is required to resolve concurrent edits' })
  version!: number;
}
