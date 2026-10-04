/** Persisted calendar snapshot, D-S01-1/5. No Firestore SDK or writes in this session. */
export interface CalendarSnapshotDocument {
  readonly timezone: 'Asia/Bangkok';
  /** ISO weekdays: Monday = 1, Sunday = 7. Validation is shared with the time layer. */
  readonly open_weekdays: readonly (1 | 2 | 3 | 4 | 5 | 6 | 7)[];
  /** Gregorian date-only YYYY-MM-DD, years 2000–2100 (validated by @gm/time). */
  readonly holidays: readonly string[];
  /** Immutable content hash and source calendar reference, supplied at snapshot creation. */
  readonly hash: string;
  readonly source: string;
}

/** C8 and D-S01-2/4: canonical persisted units; configured durations are positive whole days. */
export type SlaDurationUnit = 'business_days' | 'continuous_24h';

/** The calendar content covered by `hash` (D-S03-4). */
export type CalendarSnapshotContent = Pick<CalendarSnapshotDocument, 'timezone' | 'open_weekdays' | 'holidays'>;

/**
 * Canonical JSON hashed with SHA-256 into `hash` (D-S03-4): fixed key order timezone,
 * open_weekdays, holidays; weekdays ascending; holidays sorted and unique; no whitespace.
 */
export function canonicalCalendarSnapshotJson(content: CalendarSnapshotContent): string {
  return JSON.stringify({
    timezone: content.timezone,
    open_weekdays: [...content.open_weekdays].sort((a, b) => a - b),
    holidays: [...new Set(content.holidays)].sort(),
  });
}
