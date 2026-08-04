import { resolveDatePreset, formatDateRangeLabel } from './date-preset.util';

describe('date-preset.util', () => {
  // Pin "now" to August 2026 so the examples match the spec exactly.
  const now = new Date(2026, 7, 4); // Aug 4, 2026 (local)

  describe('resolveDatePreset', () => {
    it('today → single current day', () => {
      expect(resolveDatePreset('today', now)).toEqual({
        from: '2026-08-04',
        to: '2026-08-04',
      });
    });

    it('yesterday → single previous day (handles rollover)', () => {
      expect(resolveDatePreset('yesterday', new Date(2026, 7, 1))).toEqual({
        from: '2026-07-31',
        to: '2026-07-31',
      });
    });

    it('last_7_days → today and the 6 days before (inclusive)', () => {
      expect(resolveDatePreset('last_7_days', now)).toEqual({
        from: '2026-07-29',
        to: '2026-08-04',
      });
    });

    it('last_30_days → today and the 29 days before (inclusive)', () => {
      expect(resolveDatePreset('last_30_days', now)).toEqual({
        from: '2026-07-06',
        to: '2026-08-04',
      });
    });

    it('this_month → current calendar month', () => {
      expect(resolveDatePreset('this_month', now)).toEqual({
        from: '2026-08-01',
        to: '2026-08-31',
      });
    });

    it('last_month → previous calendar month', () => {
      expect(resolveDatePreset('last_month', now)).toEqual({
        from: '2026-07-01',
        to: '2026-07-31',
      });
    });

    it('last_3_months → Jun–Aug 2026 inclusive', () => {
      expect(resolveDatePreset('last_3_months', now)).toEqual({
        from: '2026-06-01',
        to: '2026-08-31',
      });
    });

    it('last_6_months → Mar–Aug 2026 inclusive', () => {
      expect(resolveDatePreset('last_6_months', now)).toEqual({
        from: '2026-03-01',
        to: '2026-08-31',
      });
    });

    it('this_year → full calendar year', () => {
      expect(resolveDatePreset('this_year', now)).toEqual({
        from: '2026-01-01',
        to: '2026-12-31',
      });
    });

    it('last_year → same month a year ago through end of this month', () => {
      expect(resolveDatePreset('last_year', now)).toEqual({
        from: '2025-08-01',
        to: '2026-08-31',
      });
    });

    it('all_time → no bounds', () => {
      expect(resolveDatePreset('all_time', now)).toEqual({});
    });

    it('custom → echoes supplied dates', () => {
      expect(
        resolveDatePreset('custom', now, {
          from: '2026-07-15',
          to: '2026-09-10',
        }),
      ).toEqual({ from: '2026-07-15', to: '2026-09-10' });
    });

    it('handles year rollover for month ranges', () => {
      const jan = new Date(2026, 0, 15); // Jan 15, 2026
      expect(resolveDatePreset('last_3_months', jan)).toEqual({
        from: '2025-11-01',
        to: '2026-01-31',
      });
    });

    it('February end date respects leap/non-leap years', () => {
      const mar2028 = new Date(2028, 2, 10); // leap year
      // last_month from March 2028 is February 2028 (29 days).
      expect(resolveDatePreset('last_month', mar2028)).toEqual({
        from: '2028-02-01',
        to: '2028-02-29',
      });
    });
  });

  describe('formatDateRangeLabel', () => {
    it('single month → MMMM YYYY', () => {
      expect(
        formatDateRangeLabel('this_month', '2026-08-01', '2026-08-31'),
      ).toBe('August 2026');
      expect(
        formatDateRangeLabel('last_month', '2026-07-01', '2026-07-31'),
      ).toBe('July 2026');
    });

    it('month range → MMM YYYY – MMM YYYY', () => {
      expect(
        formatDateRangeLabel('last_3_months', '2026-06-01', '2026-08-31'),
      ).toBe('Jun 2026 – Aug 2026');
      expect(
        formatDateRangeLabel('last_year', '2025-08-01', '2026-08-31'),
      ).toBe('Aug 2025 – Aug 2026');
    });

    it('custom → D MMM YYYY – D MMM YYYY (no leading zero on day)', () => {
      expect(formatDateRangeLabel('custom', '2026-07-15', '2026-09-10')).toBe(
        '15 Jul 2026 – 10 Sep 2026',
      );
    });

    it('day-level presets read as their friendly name', () => {
      expect(formatDateRangeLabel('today', '2026-08-04', '2026-08-04')).toBe(
        'Today',
      );
      expect(
        formatDateRangeLabel('yesterday', '2026-08-03', '2026-08-03'),
      ).toBe('Yesterday');
      expect(
        formatDateRangeLabel('last_7_days', '2026-07-29', '2026-08-04'),
      ).toBe('Last 7 Days');
      expect(
        formatDateRangeLabel('last_30_days', '2026-07-06', '2026-08-04'),
      ).toBe('Last 30 Days');
    });

    it('all_time → All Time', () => {
      expect(formatDateRangeLabel('all_time')).toBe('All Time');
    });

    it('missing bounds → All Time', () => {
      expect(formatDateRangeLabel('custom', undefined, undefined)).toBe(
        'All Time',
      );
    });
  });
});
