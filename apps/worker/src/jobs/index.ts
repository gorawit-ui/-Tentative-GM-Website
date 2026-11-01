// The worker's job handlers by kind, shared by the entrypoint and the emulator tests (A03 auto-close,
// A05 stale + presence reset, A10 display refresh, D-A10-2 release of a switched-off GM's requests;
// B09 digest, B15 renewal… arrive with their tasks).
import type { LifecycleDirectories } from '@gm/api/commands';
import type { ScheduledWorkKind } from '@gm/domain';
import type { JobHandler } from '../scheduled-work';
import { autoCloseJob } from './auto-close';
import { displayRefreshJob } from './display-refresh';
import { presenceResetJob } from './presence-reset';
import { releaseAssignmentsJob } from './release-assignments';
import { staleJob } from './stale';

export function workerJobHandlers(directories: LifecycleDirectories): Partial<Record<ScheduledWorkKind, JobHandler>> {
  return {
    auto_close: autoCloseJob(directories),
    stale: staleJob(),
    presence_reset: presenceResetJob(),
    display_refresh: displayRefreshJob(directories),
    release_assignments: releaseAssignmentsJob(directories),
  };
}
