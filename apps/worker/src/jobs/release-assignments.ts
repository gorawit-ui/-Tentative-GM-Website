// D-A10-2 — the `release_assignments` job, written when the Admin switches off a GM who was still the
// assignee of open requests. The API runs it at once; this handler finishes what is left (a stop half
// way): each request in its own checked transaction, rechecking the latest request, so one already
// released or taken by another GM is left alone and a rerun changes nothing.
import { releaseAssignmentOf, type LifecycleDirectories } from '@gm/api/commands';
import { JobFailed, type JobHandler } from '../scheduled-work';

const strings = (value: unknown): readonly string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);

export function releaseAssignmentsJob(directories: LifecycleDirectories): JobHandler {
  return async (context) => {
    const personId = context.job.data.person_id;
    if (typeof personId !== 'string' || personId === '') throw new JobFailed('JOB_INVALID', true);
    for (const requestId of strings(context.job.data.request_ids)) {
      const run = await context.runChecked((transaction) => releaseAssignmentOf(transaction, { requestId, personId, now: context.now }, directories));
      if (run.kind !== 'ran') return { kind: 'superseded' };
    }
    return { kind: 'done' };
  };
}
