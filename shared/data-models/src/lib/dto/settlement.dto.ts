import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsNumber,
  Min,
  IsUUID,
  IsEnum,
  IsInt,
  IsDateString,
} from 'class-validator';

export class ProposeSettlementDto {
  @IsUUID('4', { message: 'Recipient User ID must be a valid UUID' })
  @IsNotEmpty({ message: 'Recipient ID is required' })
  toUserId!: string;

  @IsNumber(
    {},
    { message: 'Transfer amount must be a valid numeric currency value' },
  )
  @Min(0.01, { message: 'Transfer amount must be greater than zero' })
  amount!: number;

  @IsString()
  @IsNotEmpty({ message: 'Currency code is required' })
  @MaxLength(3, { message: 'Currency code must be exactly 3 characters' })
  currency!: string;

  @IsString()
  @IsOptional()
  note?: string;
}

export class UpdateSettlementDto {
  @IsEnum(['confirmed', 'cancelled'], {
    message: 'Invalid settlement status update option',
  })
  @IsNotEmpty({ message: 'Settlement status update choice is required' })
  status!: 'confirmed' | 'cancelled';

  @IsDateString(
    {},
    {
      message:
        'Settlement confirmation date must be a valid ISO date string (YYYY-MM-DD)',
    },
  )
  @IsOptional()
  settledOn?: string;

  @IsInt({ message: 'Version must be an integer' })
  @IsNotEmpty({ message: 'Version is required to resolve concurrent edits' })
  version!: number;
}
