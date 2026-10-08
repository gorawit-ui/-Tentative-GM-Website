// The worker's job handlers by kind, shared by the entrypoint and the emulator tests.
import type { LifecycleDirectories } from '@gm/api/commands';
import type { ScheduledWorkKind } from '@gm/domain';
import type { JobHandler } from '../scheduled-work';
import { autoCloseJob } from './auto-close';

/** A05 stub: stale and presence_reset arrive with the implementation. */
export function workerJobHandlers(directories: LifecycleDirectories): Partial<Record<ScheduledWorkKind, JobHandler>> {
  return { auto_close: autoCloseJob(directories) };
}
