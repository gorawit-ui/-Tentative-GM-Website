// The storage port of the command executor (S08). The API's Firestore adapter (Admin SDK, A01)
// and the emulator test adapter implement it. Firestore rule: every read before the first write.

/** A stored document as plain data (instants as epoch milliseconds; the adapter maps Timestamps). */
export type StoredData = Readonly<Record<string, unknown>>;

export interface CommandTransaction {
  get(path: string): Promise<StoredData | undefined>;
  /** Plain data only: no `undefined` values (absent fields are left out). */
  set(path: string, data: object): void;
  update(path: string, data: object): void;
  /** A04: removes a document (a request flagged confidential has no public summary, §6.4.1). */
  delete(path: string): void;
  /**
   * A11: the documents of a collection whose `field` equals `value`, at most `limit` (e.g. the areas of
   * one location, to keep area names unique). A read: call it before the first write.
   */
  list?(collection: string, field: string, value: string, limit: number): Promise<readonly { readonly id: string; readonly data: StoredData }[]>;
}

export interface CommandStore {
  /** Serializable transaction; the work may run more than once under contention. */
  runTransaction<T>(work: (transaction: CommandTransaction) => Promise<T>): Promise<T>;
}
