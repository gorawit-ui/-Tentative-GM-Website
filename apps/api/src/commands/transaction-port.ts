// The storage port of the command executor (S08). The API's Firestore adapter (Admin SDK, A01)
// and the emulator test adapter implement it. Firestore rule: every read before the first write.

/** A stored document as plain data (instants as epoch milliseconds; the adapter maps Timestamps). */
export type StoredData = Readonly<Record<string, unknown>>;

export interface CommandTransaction {
  get(path: string): Promise<StoredData | undefined>;
  /** Plain data only: no `undefined` values (absent fields are left out). */
  set(path: string, data: object): void;
  update(path: string, data: object): void;
}

export interface CommandStore {
  /** Serializable transaction; the work may run more than once under contention. */
  runTransaction<T>(work: (transaction: CommandTransaction) => Promise<T>): Promise<T>;
}
