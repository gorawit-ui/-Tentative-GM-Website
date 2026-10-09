// The worker's job handlers by kind, shared by the entrypoint and the emulator tests (A03 auto-close,
// A05 stale + presence reset; B09 digest, B15 renewal… arrive with their tasks).
import type { LifecycleDirectories } from '@gm/api/commands';
import type { ScheduledWorkKind } from '@gm/domain';
import type { JobHandler } from '../scheduled-work';
import { autoCloseJob } from './auto-close';
import { presenceResetJob } from './presence-reset';
import { staleJob } from './stale';

export function workerJobHandlers(directories: LifecycleDirectories): Partial<Record<ScheduledWorkKind, JobHandler>> {
  return { auto_close: autoCloseJob(directories), stale: staleJob(), presence_reset: presenceResetJob() };
}
