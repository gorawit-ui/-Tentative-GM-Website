// A02 stub — implemented after the failing tests are committed.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { WorkerDeps } from './deps';
import type { WorkerLogger } from './log';
import type { NotificationMode } from './notification-mode';
import type { DispatchResult } from './outbox-dispatch';
import type { TickReport } from './tick';

export interface WorkerOperations {
  tick(): Promise<TickReport>;
  dispatch(outboxIds: readonly string[]): Promise<Readonly<Partial<Record<DispatchResult, number>>>>;
}

export function workerOperations(_deps: WorkerDeps): WorkerOperations {
  return { tick: () => Promise.reject(new Error('not implemented')), dispatch: () => Promise.reject(new Error('not implemented')) };
}

export function createWorkerHandler(_options: {
  readonly notificationMode: NotificationMode;
  readonly operations: WorkerOperations;
  readonly log: WorkerLogger;
}): (request: IncomingMessage, response: ServerResponse) => void {
  return (_request, response) => {
    response.writeHead(501);
    response.end();
  };
}
