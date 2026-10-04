// S06 — business-date bucket for the follow-up reminder quota (C3: 1 per business day per request;
// Part 6 §6.14: a closed day is bucketed into the next business day and adds no quota).
import { describe, expect, it } from 'vitest';
import { businessDateBucket, nextWorkingMorning, type CalendarSnapshot } from './index';

const at = (iso: string) => Date.parse(iso);

/** Mon–Fri, Asia/Bangkok, holidays 31 Dec 2026 and 1 Jan 2027. */
const COMPANY: CalendarSnapshot = {
  timeZone: 'Asia/Bangkok',
  openWeekdays: [1, 2, 3, 4, 5],
  holidays: ['2026-12-31', '2027-01-01'],
};

describe('businessDateBucket', () => {
  it.each([
    ['Wed 30 Dec 2026 10:00', '2026-12-30T10:00:00+07:00', '2026-12-30'],
    ['Wed 30 Dec 2026 00:00', '2026-12-30T00:00:00+07:00', '2026-12-30'],
    ['Wed 30 Dec 2026 23:59', '2026-12-30T23:59:59+07:00', '2026-12-30'],
    ['Mon 4 Jan 2027 00:00', '2027-01-04T00:00:00+07:00', '2027-01-04'],
  ])('an open day is its own bucket: %s', (_label, iso, date) => {
    expect(businessDateBucket(at(iso), COMPANY)).toEqual({ businessDate: date, isOpenDay: true });
  });

  it.each([
    ['holiday Thu 31 Dec 2026', '2026-12-31T10:00:00+07:00'],
    ['holiday Fri 1 Jan 2027', '2027-01-01T10:00:00+07:00'],
    ['Sat 2 Jan 2027', '2027-01-02T10:00:00+07:00'],
    ['Sun 3 Jan 2027 23:59', '2027-01-03T23:59:59+07:00'],
  ])('a closed day goes to the next business day: %s → Mon 4 Jan 2027', (_label, iso) => {
    expect(businessDateBucket(at(iso), COMPANY)).toEqual({ businessDate: '2027-01-04', isOpenDay: false });
  });

  it('uses the Asia/Bangkok date, not the UTC date', () => {
    // 30 Dec 2026 17:30 UTC = 31 Dec 00:30 in Bangkok (a holiday).
    expect(businessDateBucket(at('2026-12-30T17:30:00Z'), COMPANY)).toEqual({
      businessDate: '2027-01-04',
      isOpenDay: false,
    });
  });

  it('validates the calendar', () => {
    expect(() => businessDateBucket(at('2026-12-30T10:00:00+07:00'), { ...COMPANY, timeZone: 'Asia/Tokyo' })).toThrow(
      RangeError,
    );
  });

  it('rejects a non-integer instant', () => {
    expect(() => businessDateBucket(Number.NaN, COMPANY)).toThrow(RangeError);
  });
});

describe('nextWorkingMorning (Part 6 §6.7, D-S06-2)', () => {
  const iso = (instant: number) => new Date(instant).toISOString();

  it.each([
    ['holiday Thu 31 Dec 2026 10:00', '2026-12-31T10:00:00+07:00'],
    ['Sat 2 Jan 2027 23:00', '2027-01-02T23:00:00+07:00'],
    ['Mon 4 Jan 2027 00:00', '2027-01-04T00:00:00+07:00'],
    ['Mon 4 Jan 2027 09:00 exactly', '2027-01-04T09:00:00+07:00'],
  ])('%s → Mon 4 Jan 2027 09:00 Bangkok', (_label, from) => {
    expect(iso(nextWorkingMorning(at(from), COMPANY, '09:00'))).toBe(iso(at('2027-01-04T09:00:00+07:00')));
  });

  it('after the morning time on an open day it is the next open day', () => {
    expect(iso(nextWorkingMorning(at('2026-12-30T09:01:00+07:00'), COMPANY, '09:00'))).toBe(
      iso(at('2027-01-04T09:00:00+07:00')),
    );
    expect(iso(nextWorkingMorning(at('2026-12-29T10:00:00+07:00'), COMPANY, '09:00'))).toBe(
      iso(at('2026-12-30T09:00:00+07:00')),
    );
  });

  it('uses the configured local time', () => {
    expect(iso(nextWorkingMorning(at('2026-12-31T10:00:00+07:00'), COMPANY, '08:30'))).toBe(
      iso(at('2027-01-04T08:30:00+07:00')),
    );
  });

  it.each(['9:00', '24:00', '09:60', '0900', ''])('rejects local time %j', (localTime) => {
    expect(() => nextWorkingMorning(at('2026-12-31T10:00:00+07:00'), COMPANY, localTime)).toThrow(RangeError);
  });
});
