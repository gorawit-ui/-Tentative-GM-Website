// FU-05 — the Firestore Admin SDK adapter of the command store port.
import type { Firestore } from 'firebase-admin/firestore';
import type { CommandStore, StoredData } from '../commands/transaction-port';

export const DEFAULT_MAX_ATTEMPTS = 20;

export function toStored(data: object): Record<string, unknown> {
  return data as Record<string, unknown>;
}

export function fromStored(data: Readonly<Record<string, unknown>>): StoredData {
  return data;
}

export function adminCommandStore(_db: Firestore, _options: { readonly maxAttempts?: number } = {}): CommandStore {
  return { runTransaction: () => Promise.reject(new Error('NOT_IMPLEMENTED')) };
}
