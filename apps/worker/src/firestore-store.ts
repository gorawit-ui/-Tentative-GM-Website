// A02 stub — implemented after the failing tests are committed.
import type { Firestore } from 'firebase-admin/firestore';
import type { WorkerStore } from './store';

export function adminWorkerStore(_db: Firestore, _options: { readonly maxAttempts?: number } = {}): WorkerStore {
  return {
    runTransaction: () => Promise.reject(new Error('not implemented')),
    due: () => Promise.reject(new Error('not implemented')),
  };
}
