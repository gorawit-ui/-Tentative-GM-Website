// A02 stub — implemented after the failing tests are committed.
import type { JobOutcome, ScheduledWorkKind } from '@gm/domain';
import type { Instant } from '@gm/time';
import type { WorkerDeps } from './deps';
import type { StoredData, WorkerTransaction } from './store';

export interface ScheduledJob {
  readonly id: string;
  readonly kind: ScheduledWorkKind;
  readonly data: StoredData;
}

export type CheckedRun<T> = { readonly kind: 'ran'; readonly value: T } | { readonly kind: 'superseded' } | { readonly kind: 'lease_lost' };

export interface JobContext {
  readonly job: ScheduledJob;
  readonly now: Instant;
  runChecked<T>(work: (transaction: WorkerTransaction, request: StoredData | undefined) => Promise<T>): Promise<CheckedRun<T>>;
}

export type JobHandler = (context: JobContext) => Promise<JobOutcome>;

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

export function runJob(_deps: WorkerDeps, _jobId: string): Promise<JobResult> {
  return Promise.reject(new Error('not implemented'));
}
