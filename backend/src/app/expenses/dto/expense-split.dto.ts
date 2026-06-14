import { IsIn, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

export const EXPENSE_SPLIT_TYPES = ['equal', 'fixed', 'percent', 'share'] as const;
export type ExpenseSplitType = (typeof EXPENSE_SPLIT_TYPES)[number];

export class ExpenseSplitInputDto {
  @IsUUID('4', { message: 'participantUserId must be a valid UUID v4' })
  @IsOptional()
  participantUserId?: string;

  @IsUUID('4', { message: 'participantGroupMemberId must be a valid UUID v4' })
  @IsOptional()
  participantGroupMemberId?: string;

  @IsIn(EXPENSE_SPLIT_TYPES, { message: 'splitType must be one of: equal, fixed, percent, share' })
  splitType!: ExpenseSplitType;

  @IsNumber({ maxDecimalPlaces: 4 }, { message: 'shareValue must be a number with up to 4 decimals' })
  @Min(0.0001, { message: 'shareValue must be greater than 0' })
  shareValue!: number;
}
