import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_MONTH_LOCK_DAY,
  ExpenseEditPolicyService,
  MONTH_LOCK_ERROR_CODE,
} from './expense-edit-policy.service';

/** Minimal ConfigService stub returning a single MONTH_LOCK_DAY value. */
function configWith(value: unknown): ConfigService {
  return {
    get: (key: string) => (key === 'MONTH_LOCK_DAY' ? value : undefined),
  } as unknown as ConfigService;
}

/** Local-time date, matching the service's use of the local Date constructor. */
function at(
  year: number,
  month1: number,
  day: number,
  hour = 12,
  min = 0,
  sec = 0,
  ms = 0,
): Date {
  return new Date(year, month1 - 1, day, hour, min, sec, ms);
}

describe('ExpenseEditPolicyService', () => {
  describe('configuration (MONTH_LOCK_DAY)', () => {
    it('defaults to 7 when config is absent', () => {
      expect(new ExpenseEditPolicyService().monthLockDay).toBe(
        DEFAULT_MONTH_LOCK_DAY,
      );
    });

    it('reads a numeric string from config', () => {
      expect(new ExpenseEditPolicyService(configWith('10')).monthLockDay).toBe(
        10,
      );
    });

    it('reads a number from config', () => {
      expect(new ExpenseEditPolicyService(configWith(5)).monthLockDay).toBe(5);
    });

    it('falls back to the default for non-numeric config', () => {
      expect(new ExpenseEditPolicyService(configWith('abc')).monthLockDay).toBe(
        DEFAULT_MONTH_LOCK_DAY,
      );
    });

    it('clamps values above 28 down to 28 (so Feb never overflows)', () => {
      expect(new ExpenseEditPolicyService(configWith('31')).monthLockDay).toBe(
        28,
      );
    });

    it('clamps values below 1 up to 1', () => {
      expect(new ExpenseEditPolicyService(configWith('0')).monthLockDay).toBe(
        1,
      );
    });
  });

  describe('edit window (default cutoff = 7)', () => {
    let service: ExpenseEditPolicyService;

    beforeEach(() => {
      service = new ExpenseEditPolicyService();
    });

    it('current month is always editable', () => {
      const policy = service.getPolicy('2026-08-20', { now: at(2026, 8, 3) });
      expect(policy.state).toBe('open');
      expect(policy.canEditFinancialFields).toBe(true);
      expect(policy.canEditMetadata).toBe(true);
      expect(policy.canDeleteExpense).toBe(true);
      expect(policy.lockedReason).toBeNull();
    });

    it('a future-dated expense is editable', () => {
      expect(
        service.canEditFinancialFields('2026-09-01', { now: at(2026, 8, 3) }),
      ).toBe(true);
    });

    it('previous month BEFORE the cutoff is editable', () => {
      // July expense, "now" = Aug 3 → within grace (until Aug 7).
      expect(
        service.canEditFinancialFields('2026-07-15', { now: at(2026, 8, 3) }),
      ).toBe(true);
    });

    it('previous month ON the cutoff day is editable (inclusive)', () => {
      expect(
        service.canEditFinancialFields('2026-07-15', {
          now: at(2026, 8, 7, 12),
        }),
      ).toBe(true);
    });

    it('previous month at the very last millisecond of the cutoff day is editable', () => {
      expect(
        service.canEditFinancialFields('2026-07-15', {
          now: at(2026, 8, 7, 23, 59, 59, 999),
        }),
      ).toBe(true);
    });

    it('previous month AFTER the cutoff is fully locked', () => {
      const policy = service.getPolicy('2026-07-15', {
        now: at(2026, 8, 8, 0, 0, 0),
      });
      expect(policy.state).toBe('closed');
      expect(policy.canEditFinancialFields).toBe(false);
      expect(policy.canEditMetadata).toBe(false);
      expect(policy.canDeleteExpense).toBe(false);
      expect(policy.lockedReason).toContain('closed month');
    });

    it('older months are locked even before the cutoff day', () => {
      // June expense, "now" = Aug 3 (before the 7th) → still locked, because
      // June's grace ended on July 7.
      expect(
        service.canEditFinancialFields('2026-06-30', { now: at(2026, 8, 3) }),
      ).toBe(false);
    });

    it('a much older month is locked', () => {
      expect(
        service.canDeleteExpense('2024-01-10', { now: at(2026, 8, 3) }),
      ).toBe(false);
    });
  });

  describe('December → January rollover', () => {
    const service = new ExpenseEditPolicyService();

    it('a December expense stays editable through Jan 7 of the next year', () => {
      expect(
        service.canEditFinancialFields('2025-12-20', { now: at(2026, 1, 5) }),
      ).toBe(true);
      expect(
        service.canEditFinancialFields('2025-12-20', { now: at(2026, 1, 7) }),
      ).toBe(true);
    });

    it('a December expense locks on Jan 8 of the next year', () => {
      expect(
        service.canEditFinancialFields('2025-12-20', {
          now: at(2026, 1, 8, 0, 0, 1),
        }),
      ).toBe(false);
    });
  });

  describe('leap year', () => {
    const service = new ExpenseEditPolicyService();

    it('a Feb 29 (leap) expense is editable in its own month', () => {
      expect(
        service.canEditFinancialFields('2024-02-29', { now: at(2024, 2, 15) }),
      ).toBe(true);
    });

    it('a February expense stays editable through Mar 7 and locks Mar 8', () => {
      expect(
        service.canEditFinancialFields('2024-02-29', { now: at(2024, 3, 7) }),
      ).toBe(true);
      expect(
        service.canEditFinancialFields('2024-02-29', { now: at(2024, 3, 8) }),
      ).toBe(false);
    });

    it('cutoff clamped to 28 keeps a January grace window valid in a non-leap Feb', () => {
      const clamped = new ExpenseEditPolicyService(configWith('31'));
      // Jan 2026 expense, cutoff clamped to Feb 28 (2026 is not a leap year).
      expect(
        clamped.canEditFinancialFields('2026-01-10', { now: at(2026, 2, 28) }),
      ).toBe(true);
      expect(
        clamped.canEditFinancialFields('2026-01-10', { now: at(2026, 3, 1) }),
      ).toBe(false);
    });
  });

  describe('invalid / missing dates are treated as open (never fabricate a lock)', () => {
    const service = new ExpenseEditPolicyService();

    it.each([undefined, null, '', 'not-a-date', '2026-13-01', '2026-00-01'])(
      'treats %p as editable',
      (value) => {
        expect(
          service.canEditFinancialFields(value as string, {
            now: at(2026, 8, 8),
          }),
        ).toBe(true);
      },
    );
  });

  describe('configurable cutoff day', () => {
    it('a cutoff of 10 keeps the previous month open until the 10th', () => {
      const service = new ExpenseEditPolicyService(configWith('10'));
      expect(
        service.canEditFinancialFields('2026-07-15', { now: at(2026, 8, 10) }),
      ).toBe(true);
      expect(
        service.canEditFinancialFields('2026-07-15', { now: at(2026, 8, 11) }),
      ).toBe(false);
    });

    it('a per-call monthLockDay overrides the configured default', () => {
      const service = new ExpenseEditPolicyService(configWith('7'));
      // Default would lock on Aug 8; the override extends grace to the 15th.
      expect(
        service.canEditFinancialFields('2026-07-15', {
          now: at(2026, 8, 12),
          monthLockDay: 15,
        }),
      ).toBe(true);
      expect(
        service.getPolicy('2026-07-15', { monthLockDay: 15 }).monthLockDay,
      ).toBe(15);
    });
  });

  describe('future-ready extension hooks', () => {
    const service = new ExpenseEditPolicyService();

    it('adminOverride reopens an otherwise-locked month', () => {
      expect(
        service.canEditFinancialFields('2020-01-01', {
          now: at(2026, 8, 8),
          adminOverride: true,
        }),
      ).toBe(true);
    });

    it('lockedBeforeMonth permanently locks earlier months regardless of grace', () => {
      // September is the current month (open by the grace rule) but sits before
      // the permanent accounting boundary of 2026-10.
      expect(
        service.canEditFinancialFields('2026-09-15', {
          now: at(2026, 9, 20),
          lockedBeforeMonth: '2026-10',
        }),
      ).toBe(false);
    });

    it('lockedBeforeMonth does not affect months on/after the boundary', () => {
      expect(
        service.canEditFinancialFields('2026-10-15', {
          now: at(2026, 10, 20),
          lockedBeforeMonth: '2026-10',
        }),
      ).toBe(true);
    });
  });

  describe('assertions', () => {
    const service = new ExpenseEditPolicyService();

    it('assertCanEdit is silent when the month is open', () => {
      expect(() =>
        service.assertCanEdit('2026-08-01', { now: at(2026, 8, 3) }),
      ).not.toThrow();
    });

    it('assertCanEdit throws a 403 with the lock error code when closed', () => {
      expect.assertions(3);
      try {
        service.assertCanEdit('2026-06-01', { now: at(2026, 8, 8) });
      } catch (err) {
        expect(err).toBeInstanceOf(ForbiddenException);
        const response = (err as ForbiddenException).getResponse() as {
          errorCode: string;
          message: string;
        };
        expect(response.errorCode).toBe(MONTH_LOCK_ERROR_CODE);
        expect(response.message).toContain('closed month');
      }
    });

    it('assertCanDelete throws when the month is closed', () => {
      expect(() =>
        service.assertCanDelete('2026-06-01', { now: at(2026, 8, 8) }),
      ).toThrow(ForbiddenException);
    });

    it('assertCanDelete is silent within the grace window', () => {
      expect(() =>
        service.assertCanDelete('2026-07-20', { now: at(2026, 8, 5) }),
      ).not.toThrow();
    });
  });

  describe('lock message', () => {
    it('uses an ordinal that reflects the configured cutoff day', () => {
      expect(
        new ExpenseEditPolicyService(configWith('7')).lockMessage(),
      ).toContain('7th day of the following month');
      expect(
        new ExpenseEditPolicyService(configWith('1')).lockMessage(),
      ).toContain('1st day');
      expect(
        new ExpenseEditPolicyService(configWith('2')).lockMessage(),
      ).toContain('2nd day');
      expect(
        new ExpenseEditPolicyService(configWith('3')).lockMessage(),
      ).toContain('3rd day');
      expect(
        new ExpenseEditPolicyService(configWith('21')).lockMessage(),
      ).toContain('21st day');
    });
  });

  describe('the three axes agree under the current (fully-locked) policy', () => {
    const service = new ExpenseEditPolicyService();

    it('all true when open', () => {
      const p = service.getPolicy('2026-08-01', { now: at(2026, 8, 3) });
      expect([
        p.canEditFinancialFields,
        p.canEditMetadata,
        p.canDeleteExpense,
      ]).toEqual([true, true, true]);
    });

    it('all false when closed', () => {
      const p = service.getPolicy('2026-06-01', { now: at(2026, 8, 8) });
      expect([
        p.canEditFinancialFields,
        p.canEditMetadata,
        p.canDeleteExpense,
      ]).toEqual([false, false, false]);
    });
  });
});
