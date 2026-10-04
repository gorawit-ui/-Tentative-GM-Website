import { describe, expect, it, vi } from 'vitest';
import {
  businessDuration, effectiveWaitingEnd, mergeIntervals, slaElapsed, waitingElapsed,
  HOUR_MS, BUSINESS_DAY_MS, type CalendarSnapshot, type SlaClock, type WaitingInterval,
} from './index';

const at = (date: string) => Date.parse(date);
const MON = at('2026-10-05T09:00:00+07:00');
const h = (hours: number) => MON + hours * HOUR_MS;
const CALENDAR: CalendarSnapshot = { timeZone: 'Asia/Bangkok', openWeekdays: [1, 2, 3, 4, 5], holidays: [] };
const clock = (waitingIntervals: readonly WaitingInterval[] = [], extra: Partial<SlaClock> = {}): SlaClock => ({
  startedAt: MON, unit: 'business_days', calendarSnapshot: CALENDAR, waitingIntervals, ...extra,
});

describe('mergeIntervals: immutable half-open union', () => {
  it('sorts and merges overlapping, contained, duplicate and touching intervals', () => {
    const input = Object.freeze([
      Object.freeze({ start: 8, end: 10 }), Object.freeze({ start: 2, end: 6 }),
      Object.freeze({ start: 4, end: 5 }), Object.freeze({ start: 6, end: 8 }),
      Object.freeze({ start: 2, end: 6 }), Object.freeze({ start: 12, end: 15 }),
    ]);
    expect(mergeIntervals(input)).toEqual([{ start: 2, end: 10 }, { start: 12, end: 15 }]);
    expect(input[0]).toEqual({ start: 8, end: 10 });
  });
  it('omits zero-length ranges and accepts an empty list', () => {
    expect(mergeIntervals([{ start: 3, end: 3 }])).toEqual([]);
    expect(mergeIntervals([])).toEqual([]);
  });
  it.each([{ start: 2, end: 1 }, { start: Number.NaN, end: 3 }, { start: 1, end: Number.POSITIVE_INFINITY }, { start: 0.5, end: 2 }])('rejects invalid interval %j', (interval) => {
    expect(() => mergeIntervals([interval])).toThrow(RangeError);
  });
});

describe('effectiveWaitingEnd: A2.3 response stops waiting immediately', () => {
  it('uses now while the party has not responded or GM has not left waiting', () => {
    expect(effectiveWaitingEnd({ startedAt: h(3) }, h(30))).toBe(h(30));
  });
  it('ends at Tue 12 response, not Tue 15 GM transition', () => {
    expect(effectiveWaitingEnd({ startedAt: h(3), respondedAt: h(27), exitedAt: h(30) }, h(48))).toBe(h(27));
  });
  it('uses the GM exit if it occurs before the response', () => {
    expect(effectiveWaitingEnd({ startedAt: h(3), respondedAt: h(27), exitedAt: h(20) }, h(48))).toBe(h(20));
  });
  it('never counts a future response/exit beyond the supplied now', () => {
    expect(effectiveWaitingEnd({ startedAt: h(3), respondedAt: h(27), exitedAt: h(30) }, h(10))).toBe(h(10));
  });
  it('supports epoch zero (not a truthiness test)', () => {
    expect(effectiveWaitingEnd({ startedAt: -1, respondedAt: 0 }, 1)).toBe(0);
  });
  it.each([{ startedAt: h(3), respondedAt: h(2) }, { startedAt: h(3), exitedAt: h(2) }, { startedAt: Number.NaN }, { startedAt: h(3), respondedAt: Number.POSITIVE_INFINITY }])('rejects invalid waiting history %j', (interval) => {
    expect(() => effectiveWaitingEnd(interval, h(10))).toThrow(RangeError);
  });
  it('rejects evaluation before a waiting interval starts', () => {
    expect(() => effectiveWaitingEnd({ startedAt: h(3) }, h(2))).toThrow(RangeError);
  });
});

describe('waitingElapsed: raw party wait and business wait share the same effective end', () => {
  it('A2.3 counts 10→12 as 2 hours although GM moves back at 14', () => {
    const interval = { startedAt: h(1), respondedAt: h(3), exitedAt: h(5) };
    expect(waitingElapsed(interval, h(10), 'business_days', CALENDAR)).toBe(2 * HOUR_MS);
    expect(waitingElapsed(interval, h(10), 'continuous_24h', CALENDAR)).toBe(2 * HOUR_MS);
  });
  it('a holiday response stops raw waiting, business waiting skips closed dates', () => {
    const startedAt = at('2026-12-30T12:00:00+07:00');
    const respondedAt = at('2027-01-01T12:00:00+07:00');
    const calendar = { ...CALENDAR, holidays: ['2026-12-31', '2027-01-01'] };
    const interval = { startedAt, respondedAt };
    expect(waitingElapsed(interval, at('2027-01-04T12:00:00+07:00'), 'continuous_24h', calendar)).toBe(48 * HOUR_MS);
    expect(waitingElapsed(interval, at('2027-01-04T12:00:00+07:00'), 'business_days', calendar)).toBe(12 * HOUR_MS);
  });
  it('rejects unknown units, even for a zero-length interval', () => {
    expect(() => waitingElapsed({ startedAt: MON }, MON, 'business_day' as never, CALENDAR)).toThrow(RangeError);
  });
});

describe('slaElapsed: count elapsed in the SLA unit minus the union of effective waits', () => {
  it('Part 6 §6.7: Mon09 wait12 / Tue12 response / GM15 → Wed09 uses 24h budget', () => {
    const request = clock([{ startedAt: h(3), respondedAt: h(27), exitedAt: h(30) }]);
    expect(slaElapsed(request, h(30))).toBe(6 * HOUR_MS);
    expect(slaElapsed(request, h(48))).toBe(BUSINESS_DAY_MS);
    // Total age is unchanged: Mon09→Wed09 remains 48 real hours.
    expect(h(48) - request.startedAt).toBe(48 * HOUR_MS);
    expect(request.waitingIntervals[0]?.exitedAt).toBe(h(30));
  });
  it('does not double subtract overlaps, duplicates or touching waits', () => {
    const request = clock([
      { startedAt: h(8), exitedAt: h(12) }, { startedAt: h(3), respondedAt: h(10) },
      { startedAt: h(3), respondedAt: h(10) }, { startedAt: h(12), exitedAt: h(15) },
    ]);
    expect(slaElapsed(request, h(24))).toBe(12 * HOUR_MS);
  });
  it('multiple A→B waits stop separately, B response does not keep SLA paused', () => {
    const request = clock([{ startedAt: h(1), exitedAt: h(3) }, { startedAt: h(3), respondedAt: h(6), exitedAt: h(8) }]);
    expect(slaElapsed(request, h(10))).toBe(5 * HOUR_MS);
  });
  it('an ongoing wait pauses only its intersection with the SLA evaluation window', () => {
    expect(slaElapsed(clock([{ startedAt: h(-5), exitedAt: h(2) }, { startedAt: h(5) }]), h(10))).toBe(3 * HOUR_MS);
  });
  it('ignores intervals entirely before the clock or after the evaluation window', () => {
    expect(slaElapsed(clock([{ startedAt: h(-5), exitedAt: h(-1) }, { startedAt: h(11) }]), h(10))).toBe(10 * HOUR_MS);
  });
  it('caps total and waiting at the milestone stop, not the later now', () => {
    expect(slaElapsed(clock([{ startedAt: h(3), respondedAt: h(27) }], { stoppedAt: h(10) }), h(48))).toBe(3 * HOUR_MS);
    expect(slaElapsed(clock([], { stoppedAt: h(48) }), h(10))).toBe(10 * HOUR_MS);
  });
  it('weekends count in continuous_24h but not business_days, including the pauses', () => {
    const startedAt = at('2026-10-02T16:00:00+07:00');
    const now = at('2026-10-05T16:00:00+07:00');
    const waits = [{ startedAt: at('2026-10-03T12:00:00+07:00'), respondedAt: at('2026-10-04T12:00:00+07:00') }];
    expect(slaElapsed(clock(waits, { startedAt }), now)).toBe(businessDuration(startedAt, now, CALENDAR));
    expect(slaElapsed(clock(waits, { startedAt, unit: 'continuous_24h' }), now)).toBe(48 * HOUR_MS);
  });
  it('holiday response resumes the business clock only when the calendar opens', () => {
    const startedAt = at('2026-12-30T09:00:00+07:00');
    const request = clock([{ startedAt: at('2026-12-30T12:00:00+07:00'), respondedAt: at('2027-01-01T12:00:00+07:00') }], {
      startedAt, calendarSnapshot: { ...CALENDAR, holidays: ['2026-12-31', '2027-01-01'] },
    });
    expect(slaElapsed(request, at('2027-01-04T09:00:00+07:00'))).toBe(12 * HOUR_MS);
  });
  it('keeps millisecond precision, including a one-ms pause', () => {
    expect(slaElapsed(clock([{ startedAt: MON + 1, exitedAt: MON + 2 }]), MON + BUSINESS_DAY_MS + 1)).toBe(BUSINESS_DAY_MS);
  });
  it('is deterministic and does not mutate frozen history/snapshot', () => {
    const interval = Object.freeze({ startedAt: h(3), respondedAt: h(27) });
    const request = Object.freeze(clock(Object.freeze([interval]), { calendarSnapshot: Object.freeze(CALENDAR) }));
    const first = slaElapsed(request, h(48));
    vi.setSystemTime(at('2035-01-01T00:00:00Z'));
    expect(slaElapsed(request, h(48))).toBe(first);
    expect(request.waitingIntervals[0]).toEqual(interval);
  });
  it('returns zero at start, even with empty waits', () => { expect(slaElapsed(clock(), MON)).toBe(0); });
  it.each([
    { now: h(-1), request: clock() }, { now: Number.NaN, request: clock() },
    { now: h(10), request: clock([], { stoppedAt: h(-1) }) },
    { now: h(10), request: clock([], { unit: 'business_day' as never }) },
    { now: h(10), request: clock([], { calendarSnapshot: { ...CALENDAR, timeZone: 'UTC' } }) },
  ])('rejects invalid SLA clock input %j', ({ request, now }) => {
    expect(() => slaElapsed(request, now)).toThrow(RangeError);
  });
});
