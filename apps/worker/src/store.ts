// A02 — the worker's storage port. The Firestore Admin SDK adapter is firestore-store.ts; tests run
// it on the emulator. Rule of Firestore transactions: every read before the first write.
import type { Instant } from '@gm/time';

/** A stored document as plain data (instants as epoch milliseconds). */
export type StoredData = Readonly<Record<string, unknown>>;

export interface WorkerTransaction {
  get(path: string): Promise<StoredData | undefined>;
  /** Replaces the whole document. Plain data only: no `undefined` values. */
  set(path: string, data: object): void;
  /** Removes a document (the shared request pipeline may drop a public summary). */
  delete(path: string): void;
}

export interface DueDocument {
  readonly id: string;
  readonly data: StoredData;
}

/** Where the previous page ended: the due time and document ID of its last document. */
export interface DueCursor {
  readonly at: Instant;
  readonly id: string;
}

/** Collections the tick sweeps, each with the time field that says when a document is due. */
export const DUE_FIELD = { outbox: 'next_attempt_at', scheduled_work: 'next_run_at' } as const;
export type DueCollection = keyof typeof DUE_FIELD;

export interface WorkerStore {
  /** Serializable transaction; the work may run more than once under contention. */
  runTransaction<T>(work: (transaction: WorkerTransaction) => Promise<T>): Promise<T>;
  /** `state` = value, due field <= now, ordered by due field then document ID (Part 6 §6.11 queries). */
  due(collection: DueCollection, state: string, now: Instant, limit: number, after?: DueCursor): Promise<readonly DueDocument[]>;
  /**
   * A05: IDs of open requests (queued / in progress / waiting) after `after`, by ID — only for the
   * one-off recompute after a calendar change, never on every tick (Part 6 §6.9).
   */
  openRequests(after: string | undefined, limit: number): Promise<readonly string[]>;
}
