// S03 — stale and auto-close clocks (Part 6 §6.7, C5, TEST-CHECKLIST §1).
// stale: strictly MORE than 3 business days since last_updated_at ("เกิน").
// auto-close: AT LEAST 3 business days since completed_at ("ครบ").
import { describe, expect, it } from 'vitest';
import { BUSINESS_DAY_MS, autoCloseDue, isAutoCloseDue, staleState, type CalendarSnapshot } from './index';

const at = (iso: string) => Date.parse(iso);
const utc = (instant: number) => new Date(instant).toISOString();
const MINUTE = 60_000;

/** Company calendar for these cases: Mon–Fri, Asia/Bangkok, test holidays 31 Dec 2026 and 1 Jan 2027. */
const COMPANY: CalendarSnapshot = {
  timeZone: 'Asia/Bangkok',
  openWeekdays: [1, 2, 3, 4, 5],
  holidays: ['2026-12-31', '2027-01-01'],
};

describe('autoCloseDue — completed_at + 3 business days', () => {
  it('completed Wed 30 Dec 2026 16:00 → auto-close Wed 6 Jan 2027 16:00', () => {
    expect(utc(autoCloseDue(at('2026-12-30T16:00:00+07:00'), COMPANY))).toBe(utc(at('2027-01-06T16:00:00+07:00')));
  });

  it('Part 6 §6.7: completed Mon 28 Dec 2026 09:30 → auto-close Mon 4 Jan 2027 09:30', () => {
    expect(utc(autoCloseDue(at('2026-12-28T09:30:00+07:00'), COMPANY))).toBe(utc(at('2027-01-04T09:30:00+07:00')));
  });

  it('is due exactly at 3 business days ("ครบ"), not one minute before', () => {
    const completedAt = at('2026-12-30T16:00:00+07:00');
    const due = at('2027-01-06T16:00:00+07:00');
    expect(isAutoCloseDue(completedAt, due, COMPANY)).toBe(true);
    expect(isAutoCloseDue(completedAt, due - MINUTE, COMPANY)).toBe(false);
    expect(isAutoCloseDue(completedAt, due - 1, COMPANY)).toBe(false);
  });

  it('a holiday-and-weekend gap does not make it due early', () => {
    const completedAt = at('2026-12-30T16:00:00+07:00');
    expect(isAutoCloseDue(completedAt, at('2027-01-03T23:59:00+07:00'), COMPANY)).toBe(false);
  });
});

describe('staleState — last_updated_at + more than 3 business days', () => {
  const lastUpdatedAt = at('2026-12-28T09:30:00+07:00');
  const threshold = at('2027-01-04T09:30:00+07:00');

  it('3 business days after Mon 28 Dec 2026 09:30 are reached at Mon 4 Jan 2027 09:30', () => {
    expect(utc(staleState(lastUpdatedAt, threshold, COMPANY).thresholdAt)).toBe(utc(threshold));
  });

  it('exactly 3 business days is NOT stale yet (Part 6: stale needs more than 3)', () => {
    expect(staleState(lastUpdatedAt, threshold, COMPANY)).toEqual({
      elapsed: 3 * BUSINESS_DAY_MS,
      thresholdAt: threshold,
      stale: false,
    });
  });

  it('one minute before the threshold is not stale', () => {
    const state = staleState(lastUpdatedAt, threshold - MINUTE, COMPANY);
    expect(state.stale).toBe(false);
    expect(state.elapsed).toBe(3 * BUSINESS_DAY_MS - MINUTE);
  });

  it('3 business days + 1 ms is stale (raw value, no rounding)', () => {
    const state = staleState(lastUpdatedAt, threshold + 1, COMPANY);
    expect(state.stale).toBe(true);
    expect(state.elapsed).toBe(3 * BUSINESS_DAY_MS + 1);
  });

  it('holidays and the weekend do not count toward stale', () => {
    // Thu 31 Dec – Sun 3 Jan are all closed: elapsed stays at the 2.5 BD reached by Wed 30 Dec 24:00.
    const state = staleState(lastUpdatedAt, at('2027-01-03T23:00:00+07:00'), COMPANY);
    expect(state.elapsed).toBe(3 * BUSINESS_DAY_MS - 9.5 * 3_600_000);
    expect(state.stale).toBe(false);
  });

  it('rejects now before last_updated_at', () => {
    expect(() => staleState(lastUpdatedAt, lastUpdatedAt - 1, COMPANY)).toThrow(RangeError);
  });
});
