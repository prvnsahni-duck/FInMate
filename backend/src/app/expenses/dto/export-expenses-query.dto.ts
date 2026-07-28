import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsOptional, IsString, Length } from 'class-validator';

/**
 * Query DTO for `GET /expenses/export`.
 *
 * The endpoint returns the caller's expense rows (personal + their share of
 * group expenses) matching these filters. Titles/descriptions come back as
 * ciphertext — decryption happens client-side, preserving the zero-knowledge
 * guarantee. See ExpenseExportQueryService.
 */
export class ExportExpensesQueryDto {
  /** Inclusive lower bound on expense date (YYYY-MM-DD). */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Inclusive upper bound on expense date (YYYY-MM-DD). */
  @IsOptional()
  @IsDateString()
  to?: string;

  /**
   * Which expense kinds to include. `all` (default) returns both the caller's
   * personal expenses and their share of group expenses.
   */
  @IsOptional()
  @IsIn(['personal', 'group', 'all'])
  type?: 'personal' | 'group' | 'all';

  /** Filter to a single category (exact match). */
  @IsOptional()
  @IsString()
  category?: string;

  /**
   * Settlement status. Only meaningful for group shares; personal expenses have
   * no settlement concept and are excluded when a specific status is requested.
   */
  @IsOptional()
  @IsIn(['settled', 'pending'])
  status?: 'settled' | 'pending';

  /** Filter to a single ISO currency code (case-insensitive). */
  @IsOptional()
  @IsString()
  @Length(3, 3)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  currency?: string;
}
