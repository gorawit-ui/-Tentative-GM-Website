// FU-05 — the Firestore Admin SDK adapter of the command store port (apps/api/src/commands). The
// domain works in epoch milliseconds; Firestore stores those instants as real Timestamps (so the
// D-S08-6 TTL policy on `commands.expire_at` can delete them). Contention: the Admin SDK retries a
// transaction up to `maxAttempts` times (its default of 5 was not enough for 15 concurrent creates).
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { CommandStore, CommandTransaction, StoredData } from '../commands/transaction-port';

export const DEFAULT_MAX_ATTEMPTS = 20;

/** Field names that hold instants (Part 6 §6.4.1 and the projection/command documents). */
export const INSTANT_FIELDS: ReadonlySet<string> = new Set([
  'created_at',
  'updated_at',
  'last_updated_at',
  'last_activity_at',
  'completed_at',
  'closed_at',
  'cancelled_at',
  'auto_close_due_at',
  'waiting_since',
  'responded_at',
  'planned_due_at',
  'sla_breached_at',
  'coordinate_at',
  'stale_threshold_at',
  'expire_at',
  'as_of',
  'finalized_at',
  'presence_updated_at',
  'last_viewed_at',
  'imported_at',
  'opened_at',
  'resolved_at',
  'archived_at',
  'next_run_at',
  'next_attempt_at',
]);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;

function convert(value: unknown, key: string | undefined, toFirestore: boolean): unknown {
  if (toFirestore && key !== undefined && INSTANT_FIELDS.has(key) && typeof value === 'number') return Timestamp.fromMillis(value);
  if (!toFirestore && value instanceof Timestamp) return value.toMillis();
  if (Array.isArray(value)) return value.map((item) => convert(item, undefined, toFirestore));
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([field, item]) => [field, convert(item, field, toFirestore)]));
  return value;
}

/** Domain data → Firestore data: instants become Timestamps. */
export function toStored(data: object): Record<string, unknown> {
  return convert(data, undefined, true) as Record<string, unknown>;
}

/** Firestore data → domain data: Timestamps become epoch milliseconds. */
export function fromStored(data: Readonly<Record<string, unknown>>): StoredData {
  return convert(data, undefined, false) as StoredData;
}

export function adminCommandStore(db: Firestore, options: { readonly maxAttempts?: number } = {}): CommandStore {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  return {
    runTransaction: (work) =>
      db.runTransaction(
        (transaction) => {
          const port: CommandTransaction = {
            get: async (path) => {
              const snapshot = await transaction.get(db.doc(path));
              return snapshot.exists ? fromStored(snapshot.data() ?? {}) : undefined;
            },
            set: (path, data) => {
              transaction.set(db.doc(path), toStored(data));
            },
            update: (path, data) => {
              transaction.update(db.doc(path), toStored(data));
            },
          };
          return work(port);
        },
        { maxAttempts },
      ),
  };
}
