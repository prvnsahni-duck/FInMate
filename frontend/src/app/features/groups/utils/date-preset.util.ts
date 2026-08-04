import { DatePreset } from '../models/group-filter.model';

/**
 * Pure date-preset resolution and header labelling for the group filter.
 *
 * Everything works on `YYYY-MM-DD` strings (built from local calendar parts,
 * never `Date.toISOString`) so results are timezone-stable and match the label
 * examples in the spec exactly.
 */

export interface ResolvedRange {
  from?: string;
  to?: string;
}

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD from local calendar parts (`month0` is 0-based). */
function ymd(year: number, month0: number, day: number): string {
  return `${year}-${pad(month0 + 1)}-${pad(day)}`;
}

function monthStart(year: number, month0: number): string {
  return ymd(year, month0, 1);
}

function monthEnd(year: number, month0: number): string {
  // Day 0 of the next month is the last day of `month0`.
  return ymd(year, month0, new Date(year, month0 + 1, 0).getDate());
}

/** Normalize a month offset (handles year rollover). */
function shiftMonth(
  now: Date,
  delta: number,
): { year: number; month0: number } {
  const d = new Date(now.getFullYear(), now.getMonth() + delta, 1);
  return { year: d.getFullYear(), month0: d.getMonth() };
}

/**
 * Resolve a preset to inclusive `{from,to}` bounds. `all_time` yields an empty
 * range (no bounds); `custom` echoes the caller-supplied dates.
 */
export function resolveDatePreset(
  preset: DatePreset,
  now: Date = new Date(),
  custom?: ResolvedRange,
): ResolvedRange {
  const cur = { year: now.getFullYear(), month0: now.getMonth() };

  switch (preset) {
    case 'this_month':
      return {
        from: monthStart(cur.year, cur.month0),
        to: monthEnd(cur.year, cur.month0),
      };
    case 'last_month': {
      const p = shiftMonth(now, -1);
      return {
        from: monthStart(p.year, p.month0),
        to: monthEnd(p.year, p.month0),
      };
    }
    case 'last_3_months': {
      const s = shiftMonth(now, -2);
      return {
        from: monthStart(s.year, s.month0),
        to: monthEnd(cur.year, cur.month0),
      };
    }
    case 'last_6_months': {
      const s = shiftMonth(now, -5);
      return {
        from: monthStart(s.year, s.month0),
        to: monthEnd(cur.year, cur.month0),
      };
    }
    case 'this_year':
      return { from: `${cur.year}-01-01`, to: `${cur.year}-12-31` };
    case 'last_year': {
      // Spec: "Aug 2025 – Aug 2026" — same month one year ago through the end
      // of the current month.
      const s = shiftMonth(now, -12);
      return {
        from: monthStart(s.year, s.month0),
        to: monthEnd(cur.year, cur.month0),
      };
    }
    case 'all_time':
      return {};
    case 'custom':
      return { from: custom?.from || undefined, to: custom?.to || undefined };
  }
}

/** Strip a leading zero from a zero-padded day (`08` → `8`). */
function parse(dateStr: string): { y: number; m0: number; d: number } {
  const [y, m, d] = dateStr.split('-').map(Number);
  return { y, m0: m - 1, d };
}

/**
 * Header label for a resolved date filter, per the spec:
 *  - single month  → `MMMM YYYY`            (This Month, Last Month)
 *  - month range   → `MMM YYYY – MMM YYYY`  (Last 3/6 Months, This/Last Year)
 *  - custom range  → `D MMM YYYY – D MMM YYYY`
 *  - all time      → `All Time`
 */
export function formatDateRangeLabel(
  preset: DatePreset,
  from?: string,
  to?: string,
): string {
  if (preset === 'all_time' || !from || !to) return 'All Time';

  const a = parse(from);
  const b = parse(to);

  if (preset === 'custom') {
    return (
      `${a.d} ${MONTHS_SHORT[a.m0]} ${a.y} – ` +
      `${b.d} ${MONTHS_SHORT[b.m0]} ${b.y}`
    );
  }

  // Month-granularity presets.
  if (a.y === b.y && a.m0 === b.m0) {
    return `${MONTHS_LONG[a.m0]} ${a.y}`;
  }
  return `${MONTHS_SHORT[a.m0]} ${a.y} – ${MONTHS_SHORT[b.m0]} ${b.y}`;
}
