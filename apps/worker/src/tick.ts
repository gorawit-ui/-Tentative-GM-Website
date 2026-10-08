// A02 stub — implemented after the failing tests are committed.
import type { WorkerDeps } from './deps';

export const TICK_LEASE_PATH = 'scheduled_work/tick';

export interface OutboxCounts {
  readonly sent: number;
  readonly retried: number;
  readonly failed: number;
  readonly unknown: number;
  readonly suppressed: number;
  readonly skipped: number;
}

export interface JobCounts {
  readonly done: number;
  readonly retried: number;
  readonly failed: number;
  readonly superseded: number;
  readonly skipped: number;
}

export type TickReport = { readonly ran: false } | { readonly ran: true; readonly outbox: OutboxCounts; readonly jobs: JobCounts; readonly more: boolean };

export function runTick(_deps: WorkerDeps): Promise<TickReport> {
  return Promise.reject(new Error('not implemented'));
}
