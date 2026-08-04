/**
 * The unified group filter object.
 *
 * A single, flat, serializable shape that drives every expense-derived surface
 * of the group page (ledger, analytics, KPIs, charts, export) and the date
 * range of the balances/contribution surfaces. Deliberately flat so new
 * filters plug in without touching the architecture: add one field here, one
 * WHERE clause on the backend, and one control in the drawer.
 *
 * `memberId`/`paidById` carry a group-member id from the member dropdowns; the
 * backend matches each against BOTH the user column and the group-member
 * column so registered and pending (Contact-backed) members resolve.
 */
export type DatePreset =
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'last_30_days'
  | 'this_month'
  | 'last_month'
  | 'last_3_months'
  | 'last_6_months'
  | 'this_year'
  | 'last_year'
  | 'all_time'
  | 'custom';

/** `both` (default) applies no transaction-type filter. */
export type TransactionTypeFilter = 'expense' | 'refund' | 'both';

export interface GroupFilterDate {
  preset: DatePreset;
  /** Resolved inclusive bounds (YYYY-MM-DD). Undefined for `all_time`. */
  from?: string;
  to?: string;
}

export interface GroupFilter {
  date: GroupFilterDate;
  category?: string;
  /** Participant (via expense splits). */
  memberId?: string;
  /** Payer. */
  paidById?: string;
  transactionType?: TransactionTypeFilter;
  // ── Reserved future slots (no UI/DB yet) ─────────────────────────────────
  // paymentMethod?: string;
  // tags?: string[];
  // amountMin?: number;
  // amountMax?: number;
  // search?: string;
  // createdById?: string;
}

/** The default view: current month, everything else unset. */
export const DEFAULT_GROUP_FILTER: GroupFilter = {
  date: { preset: 'this_month' },
  transactionType: 'both',
};

/**
 * Count of non-default filters — drives the notification badge. The default
 * `this_month` date and `both` transaction type never count, so a freshly
 * opened group shows no badge.
 */
export function countActiveFilters(f: GroupFilter): number {
  let n = 0;
  if (f.date.preset !== 'this_month') n += 1;
  if (f.category) n += 1;
  if (f.memberId) n += 1;
  if (f.paidById) n += 1;
  if (f.transactionType && f.transactionType !== 'both') n += 1;
  return n;
}

/** Deep-ish clone adequate for the flat filter shape (used for draft copies). */
export function cloneFilter(f: GroupFilter): GroupFilter {
  return { ...f, date: { ...f.date } };
}

// ── URL (de)serialization ──────────────────────────────────────────────────
// Query-param keys are kept short and stable; `null` clears a param under
// Angular's `queryParamsHandling: 'merge'`.

export interface GroupFilterQueryParams {
  datePreset?: string | null;
  from?: string | null;
  to?: string | null;
  category?: string | null;
  memberId?: string | null;
  paidBy?: string | null;
  txType?: string | null;
}

export function filterToQueryParams(f: GroupFilter): GroupFilterQueryParams {
  const isCustom = f.date.preset === 'custom';
  return {
    datePreset: f.date.preset === 'this_month' ? null : f.date.preset,
    from: isCustom ? f.date.from || null : null,
    to: isCustom ? f.date.to || null : null,
    category: f.category || null,
    memberId: f.memberId || null,
    paidBy: f.paidById || null,
    txType:
      f.transactionType && f.transactionType !== 'both'
        ? f.transactionType
        : null,
  };
}

const DATE_PRESETS: readonly DatePreset[] = [
  'today',
  'yesterday',
  'last_7_days',
  'last_30_days',
  'this_month',
  'last_month',
  'last_3_months',
  'last_6_months',
  'this_year',
  'last_year',
  'all_time',
  'custom',
];

/** Rebuild a filter from raw URL params, falling back to the default. */
export function filterFromQueryParams(
  params: Record<string, string | undefined>,
): GroupFilter {
  const rawPreset = params['datePreset'];
  const preset: DatePreset = DATE_PRESETS.includes(rawPreset as DatePreset)
    ? (rawPreset as DatePreset)
    : 'this_month';

  const txRaw = params['txType'];
  const transactionType: TransactionTypeFilter =
    txRaw === 'expense' || txRaw === 'refund' ? txRaw : 'both';

  return {
    date: {
      preset,
      from: preset === 'custom' ? params['from'] || undefined : undefined,
      to: preset === 'custom' ? params['to'] || undefined : undefined,
    },
    category: params['category'] || undefined,
    memberId: params['memberId'] || undefined,
    paidById: params['paidBy'] || undefined,
    transactionType,
  };
}
