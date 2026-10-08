// A03 — the `auto_close` job (Part 6 §6.9): written by the complete command for one request +
// completion cycle with `next_run_at` = the due time; the tick runs it through `runChecked` and the
// API's auto-close transaction, which rechecks `completed`, `closed_at` empty, the same cycle and the
// due time on the latest request. A requester who answered first, a reopen or a later cycle make the
// job superseded; the request is closed at most once.
import { autoCloseInTransaction, type LifecycleDirectories } from '@gm/api/commands';
import { JobFailed, type JobHandler } from '../scheduled-work';

export function autoCloseJob(directories: LifecycleDirectories): JobHandler {
  return async (context) => {
    const requestId = context.job.data.request_id;
    const completionCycleId = context.job.data.completion_cycle_id;
    if (typeof requestId !== 'string' || !Number.isSafeInteger(completionCycleId)) throw new JobFailed('JOB_INVALID', true);
    const run = await context.runChecked((transaction) =>
      autoCloseInTransaction(transaction, { requestId, completionCycleId: completionCycleId as number, now: context.now }, directories),
    );
    if (run.kind !== 'ran') return { kind: 'superseded' };
    const outcome = run.value;
    if (outcome.kind === 'closed') return { kind: 'done' };
    if (outcome.reason === 'not_due' && outcome.dueAt !== undefined && outcome.dueAt > context.now) return { kind: 'reschedule', at: outcome.dueAt };
    return { kind: 'superseded' };
  };
}
