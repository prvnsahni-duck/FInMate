import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class MergeContactsDto {
  @IsUUID('4', { message: 'survivingContactId must be a valid UUID' })
  survivingContactId!: string;

  @IsUUID('4', { message: 'losingContactId must be a valid UUID' })
  losingContactId!: string;

  /**
   * Required to merge a MEDIUM-confidence pair (same display name only, no
   * hard identifier in common). HIGH-confidence pairs don't need it; LOW
   * pairs can never be merged regardless of this flag.
   */
  @IsBoolean()
  @IsOptional()
  confirmed?: boolean;
}
