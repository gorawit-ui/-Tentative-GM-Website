// A05 — the `stale` job (Part 6 §6.9, S03, U4, D-S05-3). Two shapes, one kind:
//   - per request (`scheduled_work/stale-{id}`, written by every command at the first instant past
//     3 business days): rechecks status / revision / raw clock on the latest request and flips the
//     GM summary's `stale` once it is really over 3 business days of the company calendar as it is
//     now (FU-27 decision); not yet (a holiday was added) → runs again at the new due time.
//   - after a calendar change (`scope: calendar`, created by the tick when the calendar's hash
//     moves): pages through the open requests once and recomputes their GM summary stale fields and
//     their per-request job, so an added or removed holiday counts at once.
// The flag lives only in `gm_request_summaries` (U4); the scheduler never touches `last_updated_at`,
// the revision or the unread step, and writes nothing when the value is the same (§6.9).
import { OPEN_FOR_STALE, staleJobDocument, staleJobPath } from '@gm/api/commands';
import { transactionCompanyCalendar } from '@gm/api/directories';
import { staleDueAt, staleState, type CalendarSnapshot, type Instant } from '@gm/time';
import { JobFailed, type JobContext, type JobHandler } from '../scheduled-work';
import type { StoredData, WorkerTransaction } from '../store';

const SUMMARIES = 'gm_request_summaries';
/** Requests recomputed per run of the calendar job; the rest continue a minute later. */
export const RECOMPUTE_PAGE = 50;
export const RECOMPUTE_PAGES_PER_RUN = 4;

async function calendarOf(transaction: WorkerTransaction): Promise<CalendarSnapshot> {
  try {
    return await transactionCompanyCalendar(transaction);
  } catch {
    // Without a company calendar nothing can be decided; retried, then visible to the Admin.
    throw new JobFailed('CALENDAR_NOT_CONFIGURED');
  }
}

/** Writes the GM summary's stale fields only when they change (§6.9). */
function writeStale(transaction: WorkerTransaction, requestId: string, summary: StoredData | undefined, stale: boolean, thresholdAt: Instant): void {
  if (summary === undefined || (summary.stale === stale && summary.stale_threshold_at === thresholdAt)) return;
  transaction.set(`${SUMMARIES}/${requestId}`, { ...summary, stale, stale_threshold_at: thresholdAt });
}

async function checkRequest(context: JobContext, requestId: string): Promise<{ readonly kind: 'done' } | { readonly kind: 'reschedule'; readonly at: Instant } | { readonly kind: 'superseded' }> {
  const run = await context.runChecked(async (transaction, request) => {
    const calendar = await calendarOf(transaction);
    const summary = await transaction.get(`${SUMMARIES}/${requestId}`);
    if (request === undefined || !OPEN_FOR_STALE.has(String(request.status)) || typeof request.last_updated_at !== 'number') return { kind: 'superseded' } as const;
    const state = staleState(request.last_updated_at, context.now, calendar);
    if (!state.stale) return { kind: 'reschedule', at: staleDueAt(request.last_updated_at, calendar) } as const;
    writeStale(transaction, requestId, summary, true, state.thresholdAt);
    return { kind: 'done' } as const;
  });
  // The request moved on (revision) or is gone: the command that moved it scheduled a new check.
  return run.kind === 'ran' ? run.value : { kind: 'superseded' };
}

/** Recomputes one open request after a calendar change, in its own transaction. */
async function recomputeRequest(context: JobContext, requestId: string): Promise<void> {
  await context.runChecked(async (transaction) => {
    const calendar = await calendarOf(transaction);
    const request = await transaction.get(`requests/${requestId}`);
    const summary = await transaction.get(`${SUMMARIES}/${requestId}`);
    const job = await transaction.get(staleJobPath(requestId));
    if (request === undefined || !OPEN_FOR_STALE.has(String(request.status)) || typeof request.last_updated_at !== 'number' || typeof request.revision !== 'number') return;
    const state = staleState(request.last_updated_at, context.now, calendar);
    writeStale(transaction, requestId, summary, state.stale, state.thresholdAt);
    if (state.stale) return;
    const wanted = staleJobDocument(requestId, { status: request.status as 'queued', revision: request.revision, last_updated_at: request.last_updated_at }, calendar, context.now);
    const same = job !== undefined && job.state === 'scheduled' && job.next_run_at === wanted.next_run_at && job.expected_revision === wanted.expected_revision;
    if (!same) transaction.set(staleJobPath(requestId), wanted);
  });
}

async function recomputeAll(context: JobContext): Promise<{ readonly kind: 'done' } | { readonly kind: 'reschedule'; readonly at: Instant }> {
  let cursor = typeof context.job.data.cursor === 'string' ? context.job.data.cursor : undefined;
  for (let page = 0; page < RECOMPUTE_PAGES_PER_RUN; page += 1) {
    const ids = await context.openRequests(cursor, RECOMPUTE_PAGE);
    for (const requestId of ids) await recomputeRequest(context, requestId);
    if (ids.length < RECOMPUTE_PAGE) return { kind: 'done' };
    cursor = ids[ids.length - 1];
  }
  // More open requests than one run takes: remember where to continue (bounded work, §6.9).
  const path = `scheduled_work/${context.job.id}`;
  await context.runChecked(async (transaction) => {
    const job = await transaction.get(path);
    if (job !== undefined) transaction.set(path, { ...job, cursor });
  });
  return { kind: 'reschedule', at: context.now + 60_000 };
}

export function staleJob(): JobHandler {
  return async (context) => {
    const requestId = context.job.data.request_id;
    if (typeof requestId === 'string') return checkRequest(context, requestId);
    if (context.job.data.scope === 'calendar') return recomputeAll(context);
    throw new JobFailed('JOB_INVALID', true);
  };
}
