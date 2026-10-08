// A02 — what the tick, the outbox dispatcher and the job runner need. Everything outside the process
// (Firestore, the clock, the notification adapter) comes in here, so tests swap it for the emulator.
import type { ScheduledWorkKind } from '@gm/domain';
import type { Instant } from '@gm/time';
import type { NotificationAdapter } from './adapters';
import type { WorkerLogger } from './log';
import type { JobHandler } from './scheduled-work';
import type { WorkerStore } from './store';

export interface WorkerLimits {
  /** Documents per query page. */
  readonly pageSize: number;
  /** Pages per step per tick; the rest waits for the next tick (bounded work, Part 6 §6.9). */
  readonly maxPages: number;
}

export const DEFAULT_LIMITS: WorkerLimits = { pageSize: 50, maxPages: 4 };

export interface WorkerDeps {
  readonly store: WorkerStore;
  readonly adapter: NotificationAdapter;
  readonly now: () => Instant;
  readonly newLeaseId: () => string;
  readonly log: WorkerLogger;
  /** Handlers by job kind; a kind without a handler is not ready yet (A05/B). */
  readonly jobHandlers?: Partial<Record<ScheduledWorkKind, JobHandler>>;
  readonly limits?: WorkerLimits;
}
