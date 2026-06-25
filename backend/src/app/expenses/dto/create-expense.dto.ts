import { Transform } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  Validate,
} from 'class-validator';
import { ExpenseSplitInputDto } from './expense-split.dto';
import { SplitPayloadValidator } from './split-payload.validator';
import { IsCiphertext } from '../../common/decorators/is-ciphertext.decorator';

export class CreateExpenseDto {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty({ message: 'title is required' })
  @MaxLength(1000, { message: 'title cannot exceed 1000 characters' })
  @IsCiphertext({ message: 'title must be a valid ciphertext' })
  title!: string;

  @IsString()
  @IsOptional()
  @IsCiphertext({ message: 'description must be a valid ciphertext' })
  description?: string;

  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'amountTotal must be a number with up to 2 decimals' },
  )
  @Min(0.01, { message: 'amountTotal must be greater than zero' })
  amountTotal!: number;

  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase().trim() : value,
  )
  @Matches(/^[A-Z]{3}$/, {
    message: 'currency must be a valid ISO-4217 code (3 uppercase letters)',
  })
  currency!: string;

  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty({ message: 'category is required' })
  @MaxLength(64, { message: 'category cannot exceed 64 characters' })
  category!: string;

  @IsUUID('4', { message: 'paidByUserId must be a valid UUID v4' })
  paidByUserId!: string;

  @IsUUID('4', { message: 'groupId must be a valid UUID v4' })
  @IsOptional()
  groupId?: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'expenseDate must use YYYY-MM-DD format',
  })
  @IsDateString({}, { message: 'expenseDate must be a valid calendar date' })
  expenseDate!: string;

  @IsIn(['draft', 'posted', 'void'], {
    message: 'status must be one of: draft, posted, void',
  })
  @IsOptional()
  status?: 'draft' | 'posted' | 'void';

  @IsArray({ message: 'splits must be an array' })
  @Validate(SplitPayloadValidator, [true])
  splits!: ExpenseSplitInputDto[];

  @IsArray({ message: 'attachmentKeys must be an array of strings' })
  @IsString({ each: true, message: 'each attachment key must be a string' })
  @IsOptional()
  attachmentKeys?: string[];
}
