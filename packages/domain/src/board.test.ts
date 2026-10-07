// S09 — live board sections (U3): open always; completed awaiting confirmation always; closed and
// cancelled for 168 hours after closed_at / cancelled_at; a reopened request follows its status.
import { describe, expect, it } from 'vitest';
import type { Instant } from '@gm/time';
import { boardSection, isOnLiveBoard } from './index';

const bkk = (date: string, time: string): Instant => Date.parse(`${date}T${time}:00+07:00`);
const NOW = bkk('2027-01-04', '10:00');
const HOUR = 3_600_000;
const WEEK = 168 * HOUR;

describe('boardSection (U3)', () => {
  it.each(['queued', 'in_progress', 'waiting'] as const)('%s is open, whatever its age', (status) => {
    expect(boardSection({ status }, NOW)).toBe('open');
  });

  it('completed awaiting confirmation is shown even after 7 days', () => {
    expect(boardSection({ status: 'completed' }, NOW)).toBe('awaiting_confirmation');
  });

  it('closed within the last 168 hours is shown; at exactly 168 hours it is archived', () => {
    expect(boardSection({ status: 'completed', closedAt: NOW - WEEK + 1 }, NOW)).toBe('recently_closed');
    expect(boardSection({ status: 'completed', closedAt: NOW - WEEK }, NOW)).toBe('archived');
    expect(boardSection({ status: 'completed', closedAt: NOW - 2 * WEEK }, NOW)).toBe('archived');
  });

  it('the window is real hours, not business days (Mon 28 Dec 10:00 → Mon 4 Jan 10:00 across the New Year holidays)', () => {
    expect(boardSection({ status: 'completed', closedAt: bkk('2026-12-28', '10:01') }, NOW)).toBe('recently_closed');
    expect(boardSection({ status: 'completed', closedAt: bkk('2026-12-28', '10:00') }, NOW)).toBe('archived');
  });

  it('cancelled uses cancelled_at with the same window', () => {
    expect(boardSection({ status: 'cancelled', cancelledAt: NOW - HOUR }, NOW)).toBe('recently_cancelled');
    expect(boardSection({ status: 'cancelled', cancelledAt: NOW - WEEK }, NOW)).toBe('archived');
  });

  it('a reopened request follows its current status, not an old close', () => {
    expect(boardSection({ status: 'in_progress', closedAt: NOW - 3 * WEEK }, NOW)).toBe('open');
  });

  it('a cancelled request without cancelled_at is corrupt data and fails closed', () => {
    expect(() => boardSection({ status: 'cancelled' }, NOW)).toThrow();
  });

  it('isOnLiveBoard is every section except archived', () => {
    expect(isOnLiveBoard({ status: 'waiting' }, NOW)).toBe(true);
    expect(isOnLiveBoard({ status: 'completed' }, NOW)).toBe(true);
    expect(isOnLiveBoard({ status: 'completed', closedAt: NOW - HOUR }, NOW)).toBe(true);
    expect(isOnLiveBoard({ status: 'completed', closedAt: NOW - WEEK }, NOW)).toBe(false);
  });
});
