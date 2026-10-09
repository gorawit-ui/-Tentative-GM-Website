// S07 — presence/leave expiry (C7: reset to “ไม่ระบุ” at the end of the Bangkok day;
// A3: leave with an end date lasts through that date inclusive).
import { describe, expect, it } from 'vitest';
import { bangkokDateOf, presenceExpiresAt, startOfNextBangkokDay } from './index';

const at = (iso: string) => Date.parse(iso);
const iso = (instant: number) => new Date(instant).toISOString();

describe('bangkokDateOf', () => {
  it.each([
    ['2026-12-30T10:00:00+07:00', '2026-12-30'],
    ['2026-12-30T00:00:00+07:00', '2026-12-30'],
    ['2026-12-30T23:59:59+07:00', '2026-12-30'],
    ['2026-12-30T17:30:00Z', '2026-12-31'],
    ['2026-12-31T16:59:59Z', '2026-12-31'],
  ])('%s → %s', (instant, date) => {
    expect(bangkokDateOf(at(instant))).toBe(date);
  });

  it('rejects a non-integer instant', () => {
    expect(() => bangkokDateOf(Number.NaN)).toThrow(RangeError);
  });
});

describe('presenceExpiresAt', () => {
  it('a presence set during the day expires at the next Bangkok midnight', () => {
    expect(iso(presenceExpiresAt(at('2026-12-28T10:00:00+07:00')))).toBe(iso(at('2026-12-29T00:00:00+07:00')));
  });

  it('set at 00:00 lasts the whole day; set at 23:59:59 lasts one second', () => {
    expect(iso(presenceExpiresAt(at('2026-12-28T00:00:00+07:00')))).toBe(iso(at('2026-12-29T00:00:00+07:00')));
    expect(iso(presenceExpiresAt(at('2026-12-28T23:59:59+07:00')))).toBe(iso(at('2026-12-29T00:00:00+07:00')));
  });

  it('is calendar-day based: weekends and holidays still reset', () => {
    expect(iso(presenceExpiresAt(at('2027-01-02T10:00:00+07:00')))).toBe(iso(at('2027-01-03T00:00:00+07:00')));
  });

  it('leave with an end date lasts through that date (inclusive)', () => {
    expect(iso(presenceExpiresAt(at('2026-12-28T10:00:00+07:00'), '2026-12-30'))).toBe(
      iso(at('2026-12-31T00:00:00+07:00')),
    );
  });

  it('leave ending today expires at the next midnight', () => {
    expect(iso(presenceExpiresAt(at('2026-12-28T10:00:00+07:00'), '2026-12-28'))).toBe(
      iso(at('2026-12-29T00:00:00+07:00')),
    );
  });

  it('an end date before the day it was set is rejected', () => {
    expect(() => presenceExpiresAt(at('2026-12-28T10:00:00+07:00'), '2026-12-27')).toThrow(RangeError);
  });

  it.each(['2026-02-30', '28/12/2026', '2569-12-28', ''])('rejects end date %j', (date) => {
    expect(() => presenceExpiresAt(at('2026-12-28T10:00:00+07:00'), date)).toThrow(RangeError);
  });
});

describe('startOfNextBangkokDay (A08: a daily e-mail cap opens again at Bangkok midnight)', () => {
  it('the next 00:00 Asia/Bangkok, also from late evening when UTC is already the next day', () => {
    expect(startOfNextBangkokDay(at('2027-01-11T09:00:00+07:00'))).toBe(at('2027-01-12T00:00:00+07:00'));
    expect(startOfNextBangkokDay(at('2027-01-11T23:59:59+07:00'))).toBe(at('2027-01-12T00:00:00+07:00'));
    expect(startOfNextBangkokDay(at('2027-01-11T00:00:00+07:00'))).toBe(at('2027-01-12T00:00:00+07:00'));
    expect(startOfNextBangkokDay(at('2026-12-31T17:30:00Z'))).toBe(at('2027-01-02T00:00:00+07:00'));
  });

  it('refuses something that is not an instant', () => {
    expect(() => startOfNextBangkokDay(Number.NaN)).toThrow(RangeError);
  });
});
