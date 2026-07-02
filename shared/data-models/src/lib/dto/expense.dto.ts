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
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Per-participant wrapped content key for direct_shared expenses. */
export class WrappedContentKeyDto {
  @IsUUID('4')
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  wrappedKey!: string;
}

/** Encrypted attachment metadata sent from the client. */
export class EncryptedAttachmentDto {
  @IsString()
  @IsNotEmpty()
  storageKey!: string;

  @IsString()
  @IsNotEmpty()
  encryptedOriginalName!: string;

  @IsString()
  @IsNotEmpty()
  encryptedFileKey!: string;

  @IsString()
  @IsNotEmpty()
  mimeType!: string;

  @IsNumber()
  @Min(0)
  sizeBytes!: number;
}

export class ExpenseSplitInputDto {
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

export class CreateExpenseDto {
  @IsString()
  @IsNotEmpty({ message: 'Expense title is required' })
  @MaxLength(160, { message: 'Expense title cannot exceed 160 characters' })
  title!: string;

  @IsString()
  @IsOptional()
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

  @IsDateString(
    {},
    { message: 'Expense date must be a valid ISO date string (YYYY-MM-DD)' },
  )
  @IsNotEmpty({ message: 'Expense date is required' })
  expenseDate!: string;

  @IsEnum(['draft', 'posted', 'void'], {
    message: 'Invalid expense status option',
  })
  @IsOptional()
  status?: 'draft' | 'posted' | 'void';

  @IsArray({ message: 'Splits must be a valid collection array' })
  @ValidateNested({ each: true })
  @Type(() => ExpenseSplitInputDto)
  splits!: ExpenseSplitInputDto[];

  @IsArray({ message: 'Attachment keys must be an array of strings' })
  @IsString({
    each: true,
    message: 'Each attachment storage key must be a string',
  })
  @IsOptional()
  attachmentKeys?: string[];

  @IsIn(['personal', 'group', 'direct_shared'], {
    message: 'encryptionScope must be personal, group, or direct_shared',
  })
  @IsOptional()
  encryptionScope?: 'personal' | 'group' | 'direct_shared';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WrappedContentKeyDto)
  @IsOptional()
  wrappedContentKeys?: WrappedContentKeyDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EncryptedAttachmentDto)
  @IsOptional()
  encryptedAttachments?: EncryptedAttachmentDto[];
}

export class UpdateExpenseDto {
  @IsString()
  @IsOptional()
  @MaxLength(160, { message: 'Expense title cannot exceed 160 characters' })
  title?: string;

  @IsString()
  @IsOptional()
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

  @IsDateString(
    {},
    { message: 'Expense date must be a valid ISO date string (YYYY-MM-DD)' },
  )
  @IsOptional()
  expenseDate?: string;

  @IsEnum(['draft', 'posted', 'void'], {
    message: 'Invalid expense status option',
  })
  @IsOptional()
  status?: 'draft' | 'posted' | 'void';

  @IsArray({ message: 'Splits must be a valid collection array' })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ExpenseSplitInputDto)
  splits?: ExpenseSplitInputDto[];

  @IsArray({ message: 'Attachment keys must be an array of strings' })
  @IsString({
    each: true,
    message: 'Each attachment storage key must be a string',
  })
  @IsOptional()
  attachmentKeys?: string[];

  @IsIn(['personal', 'group', 'direct_shared'], {
    message: 'encryptionScope must be personal, group, or direct_shared',
  })
  @IsOptional()
  encryptionScope?: 'personal' | 'group' | 'direct_shared';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WrappedContentKeyDto)
  @IsOptional()
  wrappedContentKeys?: WrappedContentKeyDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EncryptedAttachmentDto)
  @IsOptional()
  encryptedAttachments?: EncryptedAttachmentDto[];

  @IsInt({ message: 'Version must be an integer' })
  @IsNotEmpty({ message: 'Version is required to resolve concurrent edits' })
  version!: number;
}
