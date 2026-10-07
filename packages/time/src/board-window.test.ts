// S09 — U3 live-board window: closed/cancelled cards stay for a rolling 168 hours (not business days).
import { describe, expect, it } from 'vitest';
import { BOARD_RECENT_WINDOW_MS, boardRecentCutoff } from './index';

const at = (iso: string) => Date.parse(iso);

describe('boardRecentCutoff (U3)', () => {
  it('is exactly 168 hours before now, across weekends and holidays alike', () => {
    expect(BOARD_RECENT_WINDOW_MS).toBe(168 * 3_600_000);
    expect(boardRecentCutoff(at('2027-01-04T10:00:00+07:00'))).toBe(at('2026-12-28T10:00:00+07:00'));
  });

  it.each([Number.NaN, 1.5, Number.POSITIVE_INFINITY])('rejects a non-integer now (%s)', (now) => {
    expect(() => boardRecentCutoff(now)).toThrow(RangeError);
  });
});
