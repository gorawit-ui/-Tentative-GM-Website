// A02 — the one tick (Part 6 §6.9). Production: the single Scheduler job POSTs /internal/tick every
// 15 minutes; dev: `npm run tick:local`. One transaction takes the tick lease (`scheduled_work/tick`):
// a tick that finds a live lease does nothing. Then, within page and time limits:
//   1. outbox recovery — sends whose worker died (`processing`, lease over) become
//      `delivery_unknown`; due `pending` entries (no task, a failed hand-off — FU-20 — or a back-off
//      that is over) are sent through the same dispatcher Cloud Tasks uses;
//   2. due `scheduled_work` jobs.
// Then the lease is released and the finish time recorded (Admin: last successful tick, §6.13). The
// lease is shorter than the interval, so a tick that died never blocks the next one; every item has
// its own lease, so overlapping work never sends or runs the same item twice.
import { TICK_LEASE_MS, TICK_WORK_BUDGET_MS, claimTick } from '@gm/domain';
import { addElapsed, type Instant } from '@gm/time';
import { DEFAULT_LIMITS, type WorkerDeps } from './deps';
import { dispatchOutbox, type DispatchResult } from './outbox-dispatch';
import { runJob, type JobResult } from './scheduled-work';
import { DUE_FIELD, type DueCollection, type DueCursor } from './store';

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

const OUTBOX_COUNT: Readonly<Record<DispatchResult, keyof OutboxCounts>> = {
  sent: 'sent',
  retry: 'retried',
  failed: 'failed',
  unknown: 'unknown',
  suppressed: 'suppressed',
  skipped: 'skipped',
  lease_lost: 'skipped',
};

const JOB_COUNT: Readonly<Record<JobResult, keyof JobCounts>> = {
  done: 'done',
  rescheduled: 'done',
  retry: 'retried',
  failed: 'failed',
  superseded: 'superseded',
  skipped: 'skipped',
  lease_lost: 'skipped',
};

/** Pages through due documents; false when a page or time limit left some for the next tick. */
async function sweep(
  deps: WorkerDeps,
  collection: DueCollection,
  state: string,
  deadline: Instant,
  handle: (id: string) => Promise<void>,
): Promise<boolean> {
  const { pageSize, maxPages } = deps.limits ?? DEFAULT_LIMITS;
  let after: DueCursor | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const now = deps.now();
    if (now >= deadline) return false;
    const documents = await deps.store.due(collection, state, now, pageSize, after);
    for (const document of documents) await handle(document.id);
    if (documents.length < pageSize) return true;
    const last = documents[documents.length - 1];
    const at = last?.data[DUE_FIELD[collection]];
    if (last === undefined || typeof at !== 'number') return false;
    after = { at, id: last.id };
  }
  return false;
}

export async function runTick(deps: WorkerDeps): Promise<TickReport> {
  const startedAt = deps.now();
  const leaseId = deps.newLeaseId();
  const acquired = await deps.store.runTransaction(async (transaction) => {
    const lease = await transaction.get(TICK_LEASE_PATH);
    const leaseUntil = Number.isSafeInteger(lease?.lease_until) ? (lease?.lease_until as number) : undefined;
    if (claimTick(leaseUntil === undefined ? undefined : { lease_until: leaseUntil }, startedAt) === 'busy') return false;
    transaction.set(TICK_LEASE_PATH, { ...lease, kind: 'tick', lease_id: leaseId, lease_until: addElapsed(startedAt, TICK_LEASE_MS), last_started_at: startedAt });
    return true;
  });
  if (!acquired) {
    deps.log.info('tick.busy');
    return { ran: false };
  }
  deps.log.info('tick.started');

  const deadline = addElapsed(startedAt, TICK_WORK_BUDGET_MS);
  const outbox: Record<keyof OutboxCounts, number> = { sent: 0, retried: 0, failed: 0, unknown: 0, suppressed: 0, skipped: 0 };
  const jobs: Record<keyof JobCounts, number> = { done: 0, retried: 0, failed: 0, superseded: 0, skipped: 0 };
  const dispatch = async (id: string) => {
    outbox[OUTBOX_COUNT[await dispatchOutbox(deps, id)]] += 1;
  };
  // Step 1: outbox recovery — lost sends first, then everything pending and due.
  let complete = await sweep(deps, 'outbox', 'processing', deadline, dispatch);
  complete = (await sweep(deps, 'outbox', 'pending', deadline, dispatch)) && complete;
  // Step 2: due scheduled_work jobs.
  complete =
    (await sweep(deps, 'scheduled_work', 'scheduled', deadline, async (id) => {
      jobs[JOB_COUNT[await runJob(deps, id)]] += 1;
    })) && complete;

  await deps.store.runTransaction(async (transaction) => {
    const lease = await transaction.get(TICK_LEASE_PATH);
    // A tick that outlived its lease leaves the newer tick's lease alone.
    if (lease === undefined || lease.lease_id !== leaseId) return;
    const finishedAt = deps.now();
    const { lease_id: _leaseId, ...rest } = lease;
    transaction.set(TICK_LEASE_PATH, { ...rest, lease_until: finishedAt, last_completed_at: finishedAt });
  });
  deps.log.info('tick.finished', { count: outbox.sent + jobs.done, ...(complete ? {} : { code: 'MORE_WORK_NEXT_TICK' }) });
  return { ran: true, outbox, jobs, more: !complete };
}
