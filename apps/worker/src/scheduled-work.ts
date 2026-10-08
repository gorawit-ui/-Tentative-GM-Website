// A02 — `scheduled_work` jobs: the scaffold the stale / auto-close / presence / digest / renewal /
// reconcile / backup / cleanup tasks plug into (A05, B09, B15, A26…). Part 6 §6.9: a job keeps
// attempts / lease_until / last_error_code / next_run_at / completed_at; a transaction lease stops two
// workers running it together; an expired lease does not mean the work did not happen, so every
// handler writes through `runChecked`, which re-reads the job (lease still ours?) and the request
// (revision still the one the job was scheduled for?) in the same transaction as the handler's writes.
// Errors are retried with the bounded back-off; the last one stays on the job (code only).
import {
  JOB_LEASE_MS,
  JOB_STATES,
  claimJob,
  isScheduledWorkKind,
  settleJob,
  type JobOutcome,
  type JobSettlement,
  type JobState,
  type ScheduledWorkKind,
} from '@gm/domain';
import { addElapsed, type Instant } from '@gm/time';
import type { WorkerDeps } from './deps';
import type { StoredData, WorkerTransaction } from './store';

export const SCHEDULED_WORK_COLLECTION = 'scheduled_work';

export interface ScheduledJob {
  readonly id: string;
  readonly kind: ScheduledWorkKind;
  readonly data: StoredData;
}

export type CheckedRun<T> = { readonly kind: 'ran'; readonly value: T } | { readonly kind: 'superseded' } | { readonly kind: 'lease_lost' };

export interface JobContext {
  readonly job: ScheduledJob;
  readonly now: Instant;
  /**
   * One transaction: stop if this worker no longer holds the job (`lease_lost`) or the request moved
   * past `expected_revision` / is gone (`superseded`); otherwise run `work` with the request as read.
   */
  runChecked<T>(work: (transaction: WorkerTransaction, request: StoredData | undefined) => Promise<T>): Promise<CheckedRun<T>>;
}

export type JobHandler = (context: JobContext) => Promise<JobOutcome>;

/** Thrown by a handler to fail with a code (retried unless permanent). Any other error is JOB_ERROR. */
export class JobFailed extends Error {
  readonly code: string;
  readonly permanent: boolean;

  constructor(code: string, permanent = false) {
    super(code);
    this.name = 'JobFailed';
    this.code = code;
    this.permanent = permanent;
  }
}

export type JobResult = 'done' | 'rescheduled' | 'retry' | 'failed' | 'superseded' | 'skipped' | 'lease_lost';

const isJobState = (value: unknown): value is JobState => typeof value === 'string' && (JOB_STATES as readonly string[]).includes(value);

function withoutLease(stored: StoredData): Record<string, unknown> {
  const { lease_id: _leaseId, lease_until: _leaseUntil, last_error_code: _code, ...rest } = stored;
  return rest;
}

function settledJob(stored: StoredData, settlement: JobSettlement, now: Instant): Record<string, unknown> {
  return {
    ...withoutLease(stored),
    state: settlement.state,
    next_run_at: settlement.nextRunAt ?? (Number.isSafeInteger(stored.last_attempt_at) ? (stored.last_attempt_at as number) : now),
    ...(settlement.errorCode === undefined ? {} : { last_error_code: settlement.errorCode }),
    ...(settlement.state === 'scheduled' ? {} : { completed_at: now }),
  };
}

function resultOf(settlement: JobSettlement, outcome: JobOutcome): JobResult {
  if (settlement.state === 'done') return 'done';
  if (settlement.state === 'superseded') return 'superseded';
  if (settlement.state === 'failed') return 'failed';
  return outcome.kind === 'reschedule' ? 'rescheduled' : 'retry';
}

type Claim =
  | { readonly kind: 'done'; readonly result: JobResult; readonly code?: string }
  | { readonly kind: 'run'; readonly job: ScheduledJob; readonly handler: JobHandler; readonly attempts: number };

export async function runJob(deps: WorkerDeps, jobId: string): Promise<JobResult> {
  const path = `${SCHEDULED_WORK_COLLECTION}/${jobId}`;
  const leaseId = deps.newLeaseId();
  const claimed = await deps.store.runTransaction(async (transaction): Promise<Claim> => {
    const now = deps.now();
    const stored = await transaction.get(path);
    if (stored === undefined || !isJobState(stored.state) || !Number.isSafeInteger(stored.next_run_at)) return { kind: 'done', result: 'skipped' };
    const decision = claimJob(
      { state: stored.state, next_run_at: stored.next_run_at as number, ...(Number.isSafeInteger(stored.lease_until) ? { lease_until: stored.lease_until as number } : {}) },
      now,
    );
    if (decision.kind === 'skip') return { kind: 'done', result: 'skipped' };
    const attempts = (Number.isSafeInteger(stored.attempts) ? (stored.attempts as number) : 0) + 1;
    const handler = isScheduledWorkKind(stored.kind) ? deps.jobHandlers?.[stored.kind] : undefined;
    if (!isScheduledWorkKind(stored.kind) || handler === undefined) {
      // Fail visibly rather than leave it to be picked up every tick.
      const code = isScheduledWorkKind(stored.kind) ? 'JOB_KIND_NOT_READY' : 'JOB_KIND_UNKNOWN';
      transaction.set(path, { ...settledJob(stored, { state: 'failed', errorCode: code }, now), attempts, last_attempt_at: now });
      return { kind: 'done', result: 'failed', code };
    }
    const leaseUntil = addElapsed(now, JOB_LEASE_MS);
    transaction.set(path, {
      ...withoutLease(stored),
      attempts,
      lease_id: leaseId,
      lease_until: leaseUntil,
      // While leased, “due” means “lease over”: a worker that died is picked up by a later tick.
      next_run_at: leaseUntil,
      last_attempt_at: now,
    });
    return { kind: 'run', job: { id: jobId, kind: stored.kind, data: stored }, handler, attempts };
  });
  if (claimed.kind === 'done') {
    if (claimed.result !== 'skipped') deps.log.warn('job.settled', { job_id: jobId, state: claimed.result, ...(claimed.code === undefined ? {} : { code: claimed.code }) });
    return claimed.result;
  }

  const { job } = claimed;
  const context: JobContext = {
    job,
    now: deps.now(),
    runChecked: (work) =>
      deps.store.runTransaction(async (transaction) => {
        const current = await transaction.get(path);
        if (current === undefined || current.state !== 'scheduled' || current.lease_id !== leaseId) return { kind: 'lease_lost' } as const;
        const requestId = typeof job.data.request_id === 'string' ? job.data.request_id : undefined;
        const request = requestId === undefined ? undefined : await transaction.get(`requests/${requestId}`);
        if (requestId !== undefined) {
          const expected = job.data.expected_revision;
          if (request === undefined || (typeof expected === 'number' && request.revision !== expected)) return { kind: 'superseded' } as const;
        }
        return { kind: 'ran', value: await work(transaction, request) } as const;
      }),
  };

  let outcome: JobOutcome;
  try {
    outcome = await claimed.handler(context);
  } catch (error) {
    outcome =
      error instanceof JobFailed
        ? { kind: error.permanent ? 'permanent' : 'retryable', code: error.code }
        : { kind: 'retryable', code: 'JOB_ERROR' };
  }
  const now = deps.now();
  const settlement = settleJob(claimed.attempts, outcome, now);
  const result = await deps.store.runTransaction(async (transaction) => {
    const stored = await transaction.get(path);
    if (stored === undefined || stored.state !== 'scheduled' || stored.lease_id !== leaseId) return 'lease_lost' as const;
    transaction.set(path, settledJob(stored, settlement, now));
    return resultOf(settlement, outcome);
  });
  const fields = {
    job_id: jobId,
    kind: job.kind,
    state: result,
    attempts: claimed.attempts,
    ...(settlement.errorCode === undefined ? {} : { code: settlement.errorCode }),
  };
  if (result === 'failed' || result === 'lease_lost' || result === 'retry') deps.log.warn('job.settled', fields);
  else deps.log.info('job.settled', fields);
  return result;
}
