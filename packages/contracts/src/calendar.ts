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
