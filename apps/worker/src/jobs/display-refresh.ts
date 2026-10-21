// A10 / FU-11 — the `display_refresh` job, written by a people import that renamed someone (or changed
// their team): pages through the requests not closed yet (queued / in progress / waiting / completed
// awaiting confirmation) and rewrites the name pairs and labels of those that involve the renamed people
// (D-S10-1). Closed and cancelled requests keep the names they had. Bounded work per run, continued a
// minute later from where it stopped; rewriting the same names writes nothing, so a rerun is harmless.
import { refreshRequestNames, type LifecycleDirectories } from '@gm/api/commands';
import { transactionCompanyCalendar } from '@gm/api/directories';
import type { Instant } from '@gm/time';
import { JobFailed, type JobContext, type JobHandler } from '../scheduled-work';

export const REFRESH_PAGE = 50;
export const REFRESH_PAGES_PER_RUN = 4;
const NOT_CLOSED = ['queued', 'in_progress', 'waiting', 'completed'] as const;

const strings = (value: unknown): readonly string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);

export function displayRefreshJob(directories: LifecycleDirectories): JobHandler {
  return async (context: JobContext): Promise<{ readonly kind: 'done' } | { readonly kind: 'reschedule'; readonly at: Instant }> => {
    const renamed = new Set(strings(context.job.data.person_ids));
    if (renamed.size === 0) throw new JobFailed('JOB_INVALID', true);
    const involves = (personIds: readonly string[]) => personIds.some((personId) => renamed.has(personId));
    let cursor = typeof context.job.data.cursor === 'string' ? context.job.data.cursor : undefined;
    for (let page = 0; page < REFRESH_PAGES_PER_RUN; page += 1) {
      const ids = await context.openRequests(cursor, REFRESH_PAGE, NOT_CLOSED);
      for (const requestId of ids) {
        await context.runChecked(async (transaction) => {
          let workCalendar;
          try {
            workCalendar = await transactionCompanyCalendar(transaction);
          } catch {
            throw new JobFailed('CALENDAR_NOT_CONFIGURED');
          }
          await refreshRequestNames(transaction, requestId, { now: context.now, workCalendar, peopleDirectory: directories.peopleDirectory, involves });
        });
      }
      if (ids.length < REFRESH_PAGE) return { kind: 'done' };
      cursor = ids[ids.length - 1];
    }
    const path = `scheduled_work/${context.job.id}`;
    await context.runChecked(async (transaction) => {
      const job = await transaction.get(path);
      if (job !== undefined) transaction.set(path, { ...job, cursor });
    });
    return { kind: 'reschedule', at: context.now + 60_000 };
  };
}
