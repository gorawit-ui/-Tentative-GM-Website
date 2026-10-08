import type { Instant } from './calendar';

export const MINUTE_MS = 60_000;

/** A02 stub — implemented after the failing tests are committed. */
export function addElapsed(_start: Instant, _durationMs: number): Instant {
  throw new Error('not implemented');
}
