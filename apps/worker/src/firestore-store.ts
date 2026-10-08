// A02 — the Firestore Admin SDK adapter of the worker store. Transactions reuse the API's command
// store adapter (same image, different entrypoint, Part 6 §6.2), so instants are stored as real
// Timestamps the same way on both sides. Due queries: `state` + due field + document ID, the shape of
// Part 6 §6.11 (outbox: state + next_attempt_at + ID; scheduler: state + next_run_at + ID), backed by
// the composite indexes in infra/firestore.indexes.json.
import { FieldPath, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { adminCommandStore, fromStored } from '@gm/api/firestore';
import { DUE_FIELD, type WorkerStore } from './store';

export function adminWorkerStore(db: Firestore, options: { readonly maxAttempts?: number } = {}): WorkerStore {
  const commands = adminCommandStore(db, options);
  return {
    runTransaction: (work) =>
      commands.runTransaction((transaction) =>
        work({
          get: (path) => transaction.get(path),
          set: (path, data) => transaction.set(path, data),
        }),
      ),
    async due(collection, state, now, limit, after) {
      const field = DUE_FIELD[collection];
      let query = db
        .collection(collection)
        .where('state', '==', state)
        .where(field, '<=', Timestamp.fromMillis(now))
        .orderBy(field)
        .orderBy(FieldPath.documentId())
        .limit(limit);
      if (after !== undefined) query = query.startAfter(Timestamp.fromMillis(after.at), after.id);
      const snapshot = await query.get();
      return snapshot.docs.map((document) => ({ id: document.id, data: fromStored(document.data()) }));
    },
    async get(path) {
      const snapshot = await db.doc(path).get();
      return snapshot.exists ? fromStored(snapshot.data() ?? {}) : undefined;
    },
    async outboxWhere(equals, limit) {
      // Equality on two fields only: served by the single-field indexes, no composite index needed.
      const snapshot = await db.collection('outbox').where('request_id', '==', equals.request_id).where('recipient_id', '==', equals.recipient_id).limit(limit).get();
      return snapshot.docs.map((document) => ({ id: document.id, data: fromStored(document.data()) }));
    },
  };
}
