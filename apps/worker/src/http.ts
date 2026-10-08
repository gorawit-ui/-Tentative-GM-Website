// A02 — the worker's HTTP handler. On Cloud Run the service is IAM-only: Scheduler and Cloud Tasks
// call it with OIDC tokens of their service accounts and Cloud Run checks them before a request
// reaches this code (Part 6 §6.2; the IAM binding is set by the administrator, P7-INFRA-01). Bodies
// are small JSON, responses carry counts only, and the log holds route + status + code.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { healthResponse } from '@gm/contracts';
import type { WorkerDeps } from './deps';
import type { WorkerLogger } from './log';
import type { NotificationMode } from './notification-mode';
import { dispatchOutbox, type DispatchResult } from './outbox-dispatch';
import { OUTBOX_TASK_PATH, TICK_PATH, TaskRejected, parseOutboxTask } from './routes';
import { runTick, type TickReport } from './tick';

const MAX_BODY_BYTES = 64 * 1024;

export interface WorkerOperations {
  tick(): Promise<TickReport>;
  dispatch(outboxIds: readonly string[]): Promise<Readonly<Partial<Record<DispatchResult, number>>>>;
}

export function workerOperations(deps: WorkerDeps): WorkerOperations {
  return {
    tick: () => runTick(deps),
    async dispatch(outboxIds) {
      const results: Partial<Record<DispatchResult, number>> = {};
      for (const outboxId of outboxIds) {
        const result = await dispatchOutbox(deps, outboxId);
        results[result] = (results[result] ?? 0) + 1;
      }
      return results;
    },
  };
}

class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'BODY_TOO_LARGE');
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (text.trim() === '') return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, 'BODY_INVALID');
  }
}

function send(response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers,
  });
  response.end(JSON.stringify(body));
}

export function createWorkerHandler(options: {
  readonly notificationMode: NotificationMode;
  readonly operations: WorkerOperations;
  readonly log: WorkerLogger;
}): (request: IncomingMessage, response: ServerResponse) => void {
  const { notificationMode, operations, log } = options;

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<{ route: string; status: number; code?: string }> {
    const method = request.method ?? 'GET';
    const path = new URL(request.url ?? '/', 'http://worker.invalid').pathname;
    const only = (allowed: string, route: string) => {
      if (method === allowed) return true;
      send(response, 405, { error: 'METHOD_NOT_ALLOWED' }, { allow: allowed });
      return { route, status: 405, code: 'METHOD_NOT_ALLOWED' };
    };
    if (path === '/healthz') {
      if (method !== 'GET' && method !== 'HEAD') {
        send(response, 405, { error: 'METHOD_NOT_ALLOWED' }, { allow: 'GET, HEAD' });
        return { route: 'health', status: 405, code: 'METHOD_NOT_ALLOWED' };
      }
      send(response, 200, { ...healthResponse('gm-worker'), notificationMode });
      return { route: 'health', status: 200 };
    }
    if (path === TICK_PATH) {
      const allowed = only('POST', 'tick');
      if (allowed !== true) return allowed;
      await readJson(request); // the Scheduler body, if any, carries nothing the tick needs
      send(response, 200, await operations.tick());
      return { route: 'tick', status: 200 };
    }
    if (path === OUTBOX_TASK_PATH) {
      const allowed = only('POST', 'outbox_task');
      if (allowed !== true) return allowed;
      let ids: string[];
      try {
        ids = parseOutboxTask(await readJson(request));
      } catch (error) {
        if (error instanceof TaskRejected) throw new HttpError(400, 'TASK_INVALID');
        throw error;
      }
      send(response, 200, { results: await operations.dispatch(ids) });
      return { route: 'outbox_task', status: 200 };
    }
    send(response, 404, { error: 'NOT_FOUND' });
    return { route: 'not_found', status: 404, code: 'NOT_FOUND' };
  }

  return (request, response) => {
    handle(request, response)
      .catch((error: unknown) => {
        const failure = error instanceof HttpError ? error : new HttpError(500, 'INTERNAL');
        if (!response.headersSent) send(response, failure.status, { error: failure.code });
        return { route: 'error', status: failure.status, code: failure.code };
      })
      .then((outcome) => {
        const fields = { kind: outcome.route, count: outcome.status, ...(outcome.code === undefined ? {} : { code: outcome.code }) };
        if (outcome.status >= 500) log.warn('http.request', fields);
        else log.info('http.request', fields);
      });
  };
}
