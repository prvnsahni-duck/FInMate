import { ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Fallback used when MONTH_LOCK_DAY is unset or invalid. */
export const DEFAULT_MONTH_LOCK_DAY = 7;

/** Error code carried on every closed-month rejection. */
export const MONTH_LOCK_ERROR_CODE = 'EXP_EDIT_WINDOW_LOCKED';

/**
 * Optional per-call inputs. Everything here is designed as an extension seam:
 * the current policy only reads `now` and `monthLockDay`, but the remaining
 * fields are wired through the type so future rules (admin override,
 * group-specific closing dates, manual/permanent period locks) can be added
 * without changing a single call site.
 */
export interface ExpenseEditPolicyContext {
  /** Injectable clock, for deterministic tests. Defaults to `new Date()`. */
  now?: Date;

  /**
   * Overrides the configured cutoff for this decision — e.g. a group that
   * closes its books on a different day than the global default. Clamped and
   * validated exactly like the configured value.
   */
  monthLockDay?: number;

  /**
   * When true, bypasses the closing-date lock entirely. Reserved for a future
   * admin-override / "reopen month" capability; no caller sets it yet.
   */
  adminOverride?: boolean;

  /**
   * A permanent accounting boundary as `YYYY-MM`: any expense whose month is
   * strictly before this is locked forever, regardless of the grace window.
   * Reserved for a future fiscal-year / period-close capability.
   */
  lockedBeforeMonth?: string;
}

export type ExpenseMonthState = 'open' | 'closed';

/**
 * The full resolved decision for one expense. `canEditFinancialFields`,
 * `canEditMetadata` and `canDeleteExpense` are surfaced independently even
 * though today they always agree — a closed month is fully read-only — so
 * that a future policy can relax one axis (e.g. allow metadata-only
 * corrections) without every caller having to change.
 */
export interface ExpenseEditPolicy {
  state: ExpenseMonthState;
  canEditFinancialFields: boolean;
  canEditMetadata: boolean;
  canDeleteExpense: boolean;
  /** The cutoff day actually applied. */
  monthLockDay: number;
  /** Human-readable explanation when closed; `null` when open. */
  lockedReason: string | null;
}

/**
 * Single source of truth for whether a group expense's month is still open
 * for changes.
 *
 * Policy (see docs/expense-month-lock.md):
 *  - Current calendar month: always editable.
 *  - Previous calendar month: editable through MONTH_LOCK_DAY (inclusive,
 *    end of day) of the current month — a grace period for last corrections.
 *  - After that day, and every older month: fully locked. No field may be
 *    edited and the expense cannot be deleted.
 *
 * This mirrors, and now owns, the rule that used to live inline in
 * ExpensesService.assertWithinEditWindow. It is intentionally pure (given a
 * date + a clock) and side-effect free so it can be unit-tested exhaustively
 * and reused by any caller. It never talks to the database — callers decide
 * *which* expenses it applies to (personal expenses are exempt; household
 * groups use their own explicit ledger-close lock).
 */
@Injectable()
export class ExpenseEditPolicyService {
  constructor(@Optional() private readonly configService?: ConfigService) {}

  /** The configured global cutoff day, clamped to a valid day-of-month. */
  get monthLockDay(): number {
    const raw = this.configService?.get<string | number>('MONTH_LOCK_DAY');
    return this.normalizeLockDay(raw);
  }

  /**
   * Resolve the complete edit policy for an expense dated `expenseDate`
   * (`YYYY-MM-DD`). A missing or unparseable date is treated as open — the
   * lock only ever restricts, it never fabricates a lock from bad input.
   */
  getPolicy(
    expenseDate: string | null | undefined,
    context: ExpenseEditPolicyContext = {},
  ): ExpenseEditPolicy {
    const monthLockDay = this.resolveLockDay(context);

    if (context.adminOverride) {
      return this.openPolicy(monthLockDay);
    }

    const parsed = this.parseYearMonth(expenseDate);
    if (!parsed) {
      return this.openPolicy(monthLockDay);
    }

    const now = context.now ?? new Date();

    // Permanent period lock (future hook): a month strictly before the
    // permanent boundary is closed forever.
    if (this.isBeforePermanentBoundary(parsed, context.lockedBeforeMonth)) {
      return this.closedPolicy(parsed, monthLockDay);
    }

    // Grace window ends on `monthLockDay` (end of day) of the month AFTER the
    // expense's month. Passing the 1-based month as JS's 0-based month index
    // lands on the next month and rolls the year over automatically (Dec→Jan).
    const graceEnd = new Date(
      parsed.year,
      parsed.month,
      monthLockDay,
      23,
      59,
      59,
      999,
    );

    return now.getTime() <= graceEnd.getTime()
      ? this.openPolicy(monthLockDay)
      : this.closedPolicy(parsed, monthLockDay);
  }

  /** Whether any financial field may be changed. */
  canEditFinancialFields(
    expenseDate: string | null | undefined,
    context?: ExpenseEditPolicyContext,
  ): boolean {
    return this.getPolicy(expenseDate, context).canEditFinancialFields;
  }

  /**
   * Whether metadata (title / description) may be changed. Today this tracks
   * the financial lock exactly — a closed month is fully read-only — but is
   * exposed separately so a future "metadata-only correction" mode can diverge.
   */
  canEditMetadata(
    expenseDate: string | null | undefined,
    context?: ExpenseEditPolicyContext,
  ): boolean {
    return this.getPolicy(expenseDate, context).canEditMetadata;
  }

  /** Whether the expense may be deleted. */
  canDeleteExpense(
    expenseDate: string | null | undefined,
    context?: ExpenseEditPolicyContext,
  ): boolean {
    return this.getPolicy(expenseDate, context).canDeleteExpense;
  }

  /**
   * Throw a 403 unless the expense's month is open for edits. This is the
   * enforcement entry point used by the service layer; never rely on the
   * boolean helpers alone for authorization.
   */
  assertCanEdit(
    expenseDate: string | null | undefined,
    context?: ExpenseEditPolicyContext,
  ): void {
    const policy = this.getPolicy(expenseDate, context);
    if (!policy.canEditFinancialFields) {
      throw new ForbiddenException({
        errorCode: MONTH_LOCK_ERROR_CODE,
        message: policy.lockedReason ?? this.lockMessage(policy.monthLockDay),
      });
    }
  }

  /** Throw a 403 unless the expense's month is open for deletion. */
  assertCanDelete(
    expenseDate: string | null | undefined,
    context?: ExpenseEditPolicyContext,
  ): void {
    const policy = this.getPolicy(expenseDate, context);
    if (!policy.canDeleteExpense) {
      throw new ForbiddenException({
        errorCode: MONTH_LOCK_ERROR_CODE,
        message: policy.lockedReason ?? this.lockMessage(policy.monthLockDay),
      });
    }
  }

  /** The user-facing closed-month message for a given cutoff day. */
  lockMessage(monthLockDay = this.monthLockDay): string {
    return (
      'This expense belongs to a closed month. Expenses from previous ' +
      `months can only be modified until the ${this.ordinal(monthLockDay)} ` +
      'day of the following month.'
    );
  }

  // ─── internals ─────────────────────────────────────────────────────────────

  private openPolicy(monthLockDay: number): ExpenseEditPolicy {
    return {
      state: 'open',
      canEditFinancialFields: true,
      canEditMetadata: true,
      canDeleteExpense: true,
      monthLockDay,
      lockedReason: null,
    };
  }

  private closedPolicy(
    parsed: { year: number; month: number },
    monthLockDay: number,
  ): ExpenseEditPolicy {
    void parsed; // reserved for a future month-specific message
    return {
      state: 'closed',
      canEditFinancialFields: false,
      canEditMetadata: false,
      canDeleteExpense: false,
      monthLockDay,
      lockedReason: this.lockMessage(monthLockDay),
    };
  }

  private resolveLockDay(context: ExpenseEditPolicyContext): number {
    return context.monthLockDay !== undefined
      ? this.normalizeLockDay(context.monthLockDay)
      : this.monthLockDay;
  }

  private normalizeLockDay(raw: string | number | undefined | null): number {
    const value =
      typeof raw === 'string' ? Number.parseInt(raw, 10) : (raw ?? NaN);
    if (!Number.isFinite(value)) {
      return DEFAULT_MONTH_LOCK_DAY;
    }
    // Clamp to a day that exists in every month so the grace-window date is
    // always valid (Feb has 28 days).
    return Math.min(28, Math.max(1, Math.trunc(value as number)));
  }

  /** Parse `YYYY-MM-DD` (or `YYYY-MM`) into a 1-based year/month, or null. */
  private parseYearMonth(
    date: string | null | undefined,
  ): { year: number; month: number } | null {
    if (!date) return null;
    const [yearStr, monthStr] = date.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    if (
      !Number.isFinite(year) ||
      !Number.isFinite(month) ||
      month < 1 ||
      month > 12
    ) {
      return null;
    }
    return { year, month };
  }

  private isBeforePermanentBoundary(
    parsed: { year: number; month: number },
    lockedBeforeMonth: string | undefined,
  ): boolean {
    const boundary = this.parseYearMonth(lockedBeforeMonth);
    if (!boundary) return false;
    const expenseIdx = parsed.year * 12 + (parsed.month - 1);
    const boundaryIdx = boundary.year * 12 + (boundary.month - 1);
    return expenseIdx < boundaryIdx;
  }

  private ordinal(day: number): string {
    const rem100 = day % 100;
    if (rem100 >= 11 && rem100 <= 13) return `${day}th`;
    switch (day % 10) {
      case 1:
        return `${day}st`;
      case 2:
        return `${day}nd`;
      case 3:
        return `${day}rd`;
      default:
        return `${day}th`;
    }
  }
}
