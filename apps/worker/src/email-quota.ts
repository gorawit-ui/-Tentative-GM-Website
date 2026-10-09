// A08 — stub (red): implemented in the next commit.
import type { Instant } from '@gm/time';
import type { WorkerStore } from './store';

export type QuotaDecision = { readonly ok: true } | { readonly ok: false; readonly retryAt: Instant };

export interface EmailQuota {
  reserve(): Promise<QuotaDecision>;
}

export function firestoreEmailQuota(_store: WorkerStore, _now: () => Instant, _limits: { readonly perMinute: number; readonly perDay: number }): EmailQuota {
  return {
    reserve: async () => {
      throw new Error('A08 stub: firestoreEmailQuota not implemented');
    },
  };
}
