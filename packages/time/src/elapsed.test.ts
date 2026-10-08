// A02 — wall-clock (not business) time for leases and retry back-off (Part 6 §6.9: “clock/expiry
// ใช้เวลาจริง”). Kept in @gm/time with every other time calculation (CLAUDE.md).
import { describe, expect, it } from 'vitest';
import { MINUTE_MS, addElapsed } from './index';

const at = (iso: string) => Date.parse(iso);

describe('addElapsed', () => {
  it('adds real elapsed time, ignoring weekends and holidays', () => {
    expect(MINUTE_MS).toBe(60_000);
    expect(addElapsed(at('2026-12-31T23:55:00+07:00'), 10 * MINUTE_MS)).toBe(at('2027-01-01T00:05:00+07:00'));
  });

  it.each([Number.NaN, 1.5, Number.POSITIVE_INFINITY])('rejects a non-integer start (%s)', (start) => {
    expect(() => addElapsed(start, MINUTE_MS)).toThrow(RangeError);
  });

  it.each([0, -1, 0.5, Number.NaN])('rejects a duration that is not a positive whole number of ms (%s)', (duration) => {
    expect(() => addElapsed(at('2026-12-28T09:00:00+07:00'), duration)).toThrow(RangeError);
  });
});
