import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  IsEnum,
  IsInt,
  IsDateString,
  MaxLength,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Create a direct (group-less) lend/borrow entry with another user.
 * `entryType` is the UI verb; the service normalises it into a directional
 * obligation. The counterparty user id comes from the route, not the body.
 */
export class CreateDirectTransactionDto {
  @IsEnum(['lend', 'borrow'], {
    message: 'entryType must be lend or borrow',
  })
  @IsNotEmpty({ message: 'entryType is required' })
  entryType!: 'lend' | 'borrow';

  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'amount must be a number with up to 2 decimals' },
  )
  @Min(0.01, { message: 'amount must be greater than zero' })
  amount!: number;

  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase().trim() : value,
  )
  @Matches(/^[A-Z]{3}$/, {
    message: 'currency must be a valid ISO-4217 code (3 uppercase letters)',
  })
  currency!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'occurredOn must use YYYY-MM-DD format',
  })
  @IsDateString({}, { message: 'occurredOn must be a valid calendar date' })
  occurredOn!: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000, { message: 'note cannot exceed 2000 characters' })
  note?: string;
}

/**
 * Record a settlement ("Return") that reduces an outstanding direct or
 * group-derived obligation with another user. Direction is inferred from the
 * current net balance with that person.
 */
export class CreateDirectSettlementDto {
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'amount must be a number with up to 2 decimals' },
  )
  @Min(0.01, { message: 'amount must be greater than zero' })
  amount!: number;

  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase().trim() : value,
  )
  @Matches(/^[A-Z]{3}$/, {
    message: 'currency must be a valid ISO-4217 code (3 uppercase letters)',
  })
  currency!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'occurredOn must use YYYY-MM-DD format',
  })
  @IsDateString({}, { message: 'occurredOn must be a valid calendar date' })
  occurredOn!: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000, { message: 'note cannot exceed 2000 characters' })
  note?: string;
}

/** Edit a direct ledger entry (version-checked). */
export class UpdateDirectTransactionDto {
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'amount must be a number with up to 2 decimals' },
  )
  @Min(0.01, { message: 'amount must be greater than zero' })
  @IsOptional()
  amount?: number;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'occurredOn must use YYYY-MM-DD format',
  })
  @IsDateString({}, { message: 'occurredOn must be a valid calendar date' })
  @IsOptional()
  occurredOn?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000, { message: 'note cannot exceed 2000 characters' })
  note?: string;

  @IsInt({ message: 'version must be an integer' })
  @IsNotEmpty({ message: 'version is required to resolve concurrent edits' })
  version!: number;
}
