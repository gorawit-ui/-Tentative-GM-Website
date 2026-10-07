// A01 — the API over HTTP (stub).
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DeploymentEnvironment } from '@gm/domain';
import type { CommandStore, MaintenanceCatalog, PeopleDirectory } from '../commands/index';
import type { ApiDeps } from '../endpoints/index';
import type { RoutingDirectory } from '../firestore/directories';

/** Post-commit hand-off of new outbox entries to the worker (Cloud Tasks in production, A02). */
export interface TaskQueue {
  enqueue(outboxIds: readonly string[]): Promise<void>;
}

export interface HttpDeps {
  readonly api: ApiDeps;
  readonly commandStore: CommandStore;
  readonly environment: DeploymentEnvironment;
  readonly allowedOrigins: readonly string[];
  readonly newRequestId: () => string;
  readonly maintenanceCatalog: MaintenanceCatalog;
  readonly peopleDirectory: PeopleDirectory;
  readonly routingDirectory: RoutingDirectory;
  readonly taskQueue: TaskQueue;
}

export function createApiHandler(_deps: HttpDeps): (request: IncomingMessage, response: ServerResponse) => void {
  return (_request, response) => {
    response.writeHead(501, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'NOT_IMPLEMENTED' }));
  };
}
