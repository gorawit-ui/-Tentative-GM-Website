// A02 — the one tick (Part 6 §6.9). Production: the single Scheduler job POSTs /internal/tick every
// 15 minutes; dev: `npm run tick:local`. One transaction takes the tick lease (`scheduled_work/tick`):
// a tick that finds a live lease does nothing. Then, within page and time limits:
//   1. outbox recovery — sends whose worker died (`processing`, lease over) become
//      `delivery_unknown`; due `pending` entries (no task, a failed hand-off — FU-20 — or a back-off
//      that is over) are sent through the same dispatcher Cloud Tasks uses;
//   2. due `scheduled_work` jobs.
// A05: the lease transaction also starts the day's `presence_reset` job (one per Bangkok date, D-A05-5:
// a failed day never stops the next) if it is missing, and when the
// company calendar's content changed since the last tick (hash kept on the tick record) it schedules
// one `stale` recompute of the open requests — so an Admin's new holiday counts at once, while a
// normal tick reads only due work (2 extra reads per tick, never every open request).
// Then the lease is released and the finish time recorded (Admin: last successful tick, §6.13). The
// lease is shorter than the interval, so a tick that died never blocks the next one; every item has
// its own lease, so overlapping work never sends or runs the same item twice.
import { createHash } from 'node:crypto';
import { companyCalendarOf } from '@gm/api/directories';
import { canonicalCalendarSnapshotJson } from '@gm/contracts';
import { TICK_LEASE_MS, TICK_WORK_BUDGET_MS, claimTick } from '@gm/domain';
import { addElapsed, bangkokDateOf, type Instant } from '@gm/time';
import { presenceResetJobId } from './jobs/presence-reset';
import { DEFAULT_LIMITS, type WorkerDeps } from './deps';
import { dispatchOutbox, type DispatchResult } from './outbox-dispatch';
import { runJob, type JobResult } from './scheduled-work';
import { DUE_FIELD, type DueCollection, type DueCursor } from './store';

export const TICK_LEASE_PATH = 'scheduled_work/tick';
const CALENDAR_PATH = 'calendars/company';

/** Content hash of the company calendar (timezone, open weekdays, holidays), or undefined if unusable. */
function calendarHash(stored: Readonly<Record<string, unknown>> | undefined): string | undefined {
  if (stored === undefined) return undefined;
  try {
    const calendar = companyCalendarOf(stored);
    const content = { timezone: 'Asia/Bangkok' as const, open_weekdays: calendar.openWeekdays, holidays: calendar.holidays };
    return createHash('sha256').update(canonicalCalendarSnapshotJson(content), 'utf8').digest('hex');
  } catch {
    // An invalid calendar is the command's problem (CALENDAR_NOT_CONFIGURED); the tick goes on.
    return undefined;
  }
}

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
    const hash = deps.jobHandlers?.stale === undefined ? undefined : calendarHash(await transaction.get(CALENDAR_PATH));
    const presencePath = `scheduled_work/${presenceResetJobId(bangkokDateOf(startedAt))}`;
    const presenceJob = deps.jobHandlers?.presence_reset === undefined ? undefined : await transaction.get(presencePath);
    if (hash !== undefined && hash !== lease?.calendar_hash) {
      // One recompute per calendar content (a first tick with no record recomputes too: safe default).
      transaction.set(`scheduled_work/stale_calendar-${hash.slice(0, 16)}`, { kind: 'stale', scope: 'calendar', calendar_hash: hash, state: 'scheduled', next_run_at: startedAt, attempts: 0, created_at: startedAt });
    }
    if (deps.jobHandlers?.presence_reset !== undefined && presenceJob === undefined) {
      transaction.set(presencePath, { kind: 'presence_reset', state: 'scheduled', next_run_at: startedAt, attempts: 0, created_at: startedAt, business_date: bangkokDateOf(startedAt) });
    }
    transaction.set(TICK_LEASE_PATH, {
      ...lease,
      kind: 'tick',
      lease_id: leaseId,
      lease_until: addElapsed(startedAt, TICK_LEASE_MS),
      last_started_at: startedAt,
      ...(hash === undefined ? {} : { calendar_hash: hash }),
    });
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
    // Released = no lease at all, so the next tick never depends on two clocks agreeing.
    const { lease_id: _leaseId, lease_until: _leaseUntil, ...rest } = lease;
    transaction.set(TICK_LEASE_PATH, { ...rest, last_completed_at: deps.now() });
  });
  deps.log.info('tick.finished', { count: outbox.sent + jobs.done, ...(complete ? {} : { code: 'MORE_WORK_NEXT_TICK' }) });
  return { ran: true, outbox, jobs, more: !complete };
}
