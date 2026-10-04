// S01 — business time / add time (Part 6 §6.7, PRD §6.1, C5, C8, TEST-CHECKLIST §1).
// Unit tests run with the machine time zone forced to America/New_York (tests/setup), so every
// expectation below can only pass if day boundaries come from the calendar snapshot.
import { describe, expect, it, vi } from 'vitest';
import {
  BUSINESS_DAY_MS,
  HOUR_MS,
  addBusinessDuration,
  addDuration,
  businessDuration,
  type CalendarSnapshot,
} from './index';

const at = (iso: string) => Date.parse(iso);
const utc = (instant: number) => new Date(instant).toISOString();

/** Mock calendar from PRD §6.1 #7: Monday–Friday, no holidays, Asia/Bangkok. */
const MON_FRI: CalendarSnapshot = { timeZone: 'Asia/Bangkok', openWeekdays: [1, 2, 3, 4, 5], holidays: [] };
/** Test-only holidays (TEST-CHECKLIST §1): not the company's real calendar. */
const MON_FRI_NEW_YEAR: CalendarSnapshot = { ...MON_FRI, holidays: ['2026-12-31', '2027-01-01'] };

describe('Part 6 §6.7 unit-test cases', () => {
  it('Fri 2 Oct 2026 16:00 + 1 business day → Mon 5 Oct 16:00 (Mon–Fri, no holidays)', () => {
    const due = addBusinessDuration(at('2026-10-02T16:00:00+07:00'), BUSINESS_DAY_MS, MON_FRI);
    expect(utc(due)).toBe(utc(at('2026-10-05T16:00:00+07:00')));
  });

  it('same start + continuous_24h 1 day → Sat 3 Oct 16:00', () => {
    const due = addDuration(at('2026-10-02T16:00:00+07:00'), 1, 'continuous_24h', MON_FRI);
    expect(utc(due)).toBe(utc(at('2026-10-03T16:00:00+07:00')));
  });

  it('same start + 1 business_days via addDuration → Mon 5 Oct 16:00', () => {
    const due = addDuration(at('2026-10-02T16:00:00+07:00'), 1, 'business_days', MON_FRI);
    expect(utc(due)).toBe(utc(at('2026-10-05T16:00:00+07:00')));
  });

  it('Sat 3 Oct 12:00 + 1 business day → Tue 6 Oct 00:00', () => {
    const due = addBusinessDuration(at('2026-10-03T12:00:00+07:00'), BUSINESS_DAY_MS, MON_FRI);
    expect(utc(due)).toBe(utc(at('2026-10-06T00:00:00+07:00')));
  });

  it('28 Dec 2026 09:30 + 3 business days over the New Year holidays and weekend → 4 Jan 2027 09:30', () => {
    const due = addBusinessDuration(at('2026-12-28T09:30:00+07:00'), 3 * BUSINESS_DAY_MS, MON_FRI_NEW_YEAR);
    expect(utc(due)).toBe(utc(at('2027-01-04T09:30:00+07:00')));
  });
});

describe('a business day is 24 hours on open dates, not an 8-hour shift', () => {
  it('Mon 09:00 + 1 business day → Tue 09:00', () => {
    const due = addBusinessDuration(at('2026-10-05T09:00:00+07:00'), BUSINESS_DAY_MS, MON_FRI);
    expect(utc(due)).toBe(utc(at('2026-10-06T09:00:00+07:00')));
  });

  it('a whole open date measures exactly 24 hours', () => {
    expect(businessDuration(at('2026-10-05T00:00:00+07:00'), at('2026-10-06T00:00:00+07:00'), MON_FRI)).toBe(
      BUSINESS_DAY_MS,
    );
  });

  it('a weekday evening counts: Mon 17:00 → Mon 23:00 is 6 hours', () => {
    expect(businessDuration(at('2026-10-05T17:00:00+07:00'), at('2026-10-05T23:00:00+07:00'), MON_FRI)).toBe(
      6 * HOUR_MS,
    );
  });
});

describe('businessDuration', () => {
  it('Fri 16:00 → Mon 16:00 is exactly 1 business day (weekend weighs 0)', () => {
    expect(businessDuration(at('2026-10-02T16:00:00+07:00'), at('2026-10-05T16:00:00+07:00'), MON_FRI)).toBe(
      BUSINESS_DAY_MS,
    );
  });

  it('Fri 16:00 → Sat 12:00 counts only the 8 hours left on Friday', () => {
    expect(businessDuration(at('2026-10-02T16:00:00+07:00'), at('2026-10-03T12:00:00+07:00'), MON_FRI)).toBe(
      8 * HOUR_MS,
    );
  });

  it('a request opened on a closed day accumulates nothing until the next open date (PRD §6.1 #4)', () => {
    expect(businessDuration(at('2026-10-03T10:00:00+07:00'), at('2026-10-04T20:00:00+07:00'), MON_FRI)).toBe(0);
    expect(businessDuration(at('2026-10-03T10:00:00+07:00'), at('2026-10-05T01:30:00+07:00'), MON_FRI)).toBe(
      1.5 * HOUR_MS,
    );
  });

  it('28 Dec 2026 09:30 → 4 Jan 2027 09:30 is 3 business days with the New Year holidays', () => {
    expect(
      businessDuration(at('2026-12-28T09:30:00+07:00'), at('2027-01-04T09:30:00+07:00'), MON_FRI_NEW_YEAR),
    ).toBe(3 * BUSINESS_DAY_MS);
  });

  it('returns the raw value without rounding (3 business days + 1 ms)', () => {
    expect(businessDuration(at('2026-10-05T00:00:00+07:00'), at('2026-10-08T00:00:00.001+07:00'), MON_FRI)).toBe(
      3 * BUSINESS_DAY_MS + 1,
    );
  });

  it('is 0 when start equals end', () => {
    const t = at('2026-10-05T10:00:00+07:00');
    expect(businessDuration(t, t, MON_FRI)).toBe(0);
  });
});

describe('holidays and site workweeks', () => {
  it('skips consecutive holidays: Mon 12:00 + 1 business day with Tue–Thu closed → Fri 12:00', () => {
    const calendar = { ...MON_FRI, holidays: ['2026-10-06', '2026-10-07', '2026-10-08'] };
    const due = addBusinessDuration(at('2026-10-05T12:00:00+07:00'), BUSINESS_DAY_MS, calendar);
    expect(utc(due)).toBe(utc(at('2026-10-09T12:00:00+07:00')));
  });

  it('a holiday on a closed weekday changes nothing', () => {
    const withSundayHoliday = { ...MON_FRI, holidays: ['2026-10-04'] };
    const due = addBusinessDuration(at('2026-10-02T16:00:00+07:00'), BUSINESS_DAY_MS, withSundayHoliday);
    expect(utc(due)).toBe(utc(at('2026-10-05T16:00:00+07:00')));
  });

  it('supports a site workweek that includes Saturday and Sunday (Wed–Sun)', () => {
    const wedToSun: CalendarSnapshot = { timeZone: 'Asia/Bangkok', openWeekdays: [3, 4, 5, 6, 7], holidays: [] };
    const due = addBusinessDuration(at('2026-10-04T20:00:00+07:00'), BUSINESS_DAY_MS, wedToSun);
    expect(utc(due)).toBe(utc(at('2026-10-07T20:00:00+07:00')));
    expect(businessDuration(at('2026-10-02T16:00:00+07:00'), at('2026-10-03T16:00:00+07:00'), wedToSun)).toBe(
      BUSINESS_DAY_MS,
    );
  });

  it('continuous_24h counts holidays and weekends too (PRD §6.1 #5)', () => {
    const due = addDuration(at('2026-12-31T10:00:00+07:00'), 3, 'continuous_24h', MON_FRI_NEW_YEAR);
    expect(utc(due)).toBe(utc(at('2027-01-03T10:00:00+07:00')));
  });
});

describe('time zone comes from the calendar snapshot, deterministically', () => {
  it('Bangkok dates start at 00:00 +07:00, not UTC or machine midnight', () => {
    // Fri 2 Oct 23:30 → Sat 3 Oct 00:30 Bangkok: only the 30 minutes on Friday count.
    expect(businessDuration(at('2026-10-02T23:30:00+07:00'), at('2026-10-03T00:30:00+07:00'), MON_FRI)).toBe(
      30 * 60_000,
    );
  });

  it('Phase 1 rejects another snapshot zone rather than using its dates (D-S01-5)', () => {
    // 23:30 Bangkok on Friday is already Saturday 01:30 in Tokyo.
    const tokyo: CalendarSnapshot = { ...MON_FRI, timeZone: 'Asia/Tokyo' };
    expect(() => businessDuration(at('2026-10-02T23:30:00+07:00'), at('2026-10-03T00:30:00+07:00'), tokyo)).toThrow(RangeError);
  });

  it('gives identical results whatever the system clock says', () => {
    const run = () => [
      addBusinessDuration(at('2026-12-28T09:30:00+07:00'), 3 * BUSINESS_DAY_MS, MON_FRI_NEW_YEAR),
      businessDuration(at('2026-10-02T16:00:00+07:00'), at('2026-10-05T16:00:00+07:00'), MON_FRI),
    ];
    vi.setSystemTime(at('2020-02-29T12:00:00Z'));
    const first = run();
    vi.setSystemTime(at('2031-07-15T03:00:00Z'));
    expect(run()).toEqual(first);
  });

  it('adding then measuring returns the same business duration', () => {
    const starts = ['2026-10-02T16:00:00+07:00', '2026-10-03T12:00:00+07:00', '2026-12-28T09:30:00+07:00'];
    const durations = [1, 30 * 60_000, 8 * HOUR_MS, BUSINESS_DAY_MS, 3 * BUSINESS_DAY_MS + 1, 10 * BUSINESS_DAY_MS];
    for (const start of starts) {
      for (const duration of durations) {
        const end = addBusinessDuration(at(start), duration, MON_FRI_NEW_YEAR);
        expect(businessDuration(at(start), end, MON_FRI_NEW_YEAR)).toBe(duration);
      }
    }
  });
});

describe('invalid input is rejected, never guessed', () => {
  const t = at('2026-10-05T09:00:00+07:00');

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 0.5])('addBusinessDuration rejects duration %s', (duration) => {
    expect(() => addBusinessDuration(t, duration, MON_FRI)).toThrow(RangeError);
  });

  it.each([0, -1, Number.NaN])('addDuration rejects amount %s', (amount) => {
    expect(() => addDuration(t, amount, 'business_days', MON_FRI)).toThrow(RangeError);
  });

  it('addDuration rejects an unknown unit', () => {
    expect(() => addDuration(t, 1, 'hours' as never, MON_FRI)).toThrow(RangeError);
  });

  it('businessDuration rejects end before start', () => {
    expect(() => businessDuration(t, t - 1, MON_FRI)).toThrow(RangeError);
  });

  it.each([Number.NaN, 1.5, Number.POSITIVE_INFINITY])('rejects a non-integer or non-finite instant %s', (bad) => {
    expect(() => businessDuration(bad, t, MON_FRI)).toThrow(RangeError);
    expect(() => addBusinessDuration(bad, HOUR_MS, MON_FRI)).toThrow(RangeError);
  });

  it.each([
    ['unknown time zone', { ...MON_FRI, timeZone: 'Bangkok' }],
    ['no open weekday', { ...MON_FRI, openWeekdays: [] }],
    ['weekday out of range', { ...MON_FRI, openWeekdays: [0, 1] }],
    ['duplicate weekday', { ...MON_FRI, openWeekdays: [1, 1, 2] }],
    ['impossible holiday date', { ...MON_FRI, holidays: ['2026-02-30'] }],
    ['non-ISO holiday format', { ...MON_FRI, holidays: ['31/12/2026'] }],
  ])('rejects a calendar with %s', (_label, calendar) => {
    const snapshot = calendar as unknown as CalendarSnapshot;
    expect(() => businessDuration(t, t + HOUR_MS, snapshot)).toThrow(RangeError);
    expect(() => addBusinessDuration(t, HOUR_MS, snapshot)).toThrow(RangeError);
  });
});
