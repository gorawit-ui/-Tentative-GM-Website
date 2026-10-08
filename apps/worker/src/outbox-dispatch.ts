// A02 stub — implemented after the failing tests are committed.
import type { WorkerDeps } from './deps';

export type DispatchResult = 'sent' | 'retry' | 'failed' | 'unknown' | 'suppressed' | 'skipped' | 'lease_lost';

export function dispatchOutbox(_deps: WorkerDeps, _outboxId: string): Promise<DispatchResult> {
  return Promise.reject(new Error('not implemented'));
}
