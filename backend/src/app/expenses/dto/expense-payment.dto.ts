import { IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

/**
 * One payer of a multi-payer expense. Exactly one of `paidByUserId` /
 * `paidByGroupMemberId` must be set (validated in the service, mirroring the
 * single-payer rules). Amounts across all payments must sum to the expense
 * total.
 */
export class ExpensePaymentInputDto {
  @IsUUID('4', { message: 'paidByUserId must be a valid UUID v4' })
  @IsOptional()
  paidByUserId?: string;

  @IsUUID('4', { message: 'paidByGroupMemberId must be a valid UUID v4' })
  @IsOptional()
  paidByGroupMemberId?: string;

  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'payment amount must be a number with up to 2 decimals' },
  )
  @Min(0.01, { message: 'payment amount must be greater than zero' })
  amount!: number;
}
