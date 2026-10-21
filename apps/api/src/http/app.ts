// A01 — the API over HTTP (FU-16). Part 6 §6.2/§6.5: every request verifies the Firebase ID token and
// re-reads access/{uid} (role, enabled) — custom claims never decide (A09: except the login page's
// public contact box, which reads no token); CORS only for the app's origins;
// commands run in one transaction and the new outbox IDs are handed to the queue only after commit
// (a queue failure leaves the request and its pending outbox for recovery, A02). Responses are
// no-store; errors carry a code (and a field path for contract errors), never request data. The log
// line per request has the route name, status and code only.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ContractRejected, parseAdminCommand, parseCommand, parsePeopleImportBody } from '@gm/contracts';
import { LifecycleRejected, RequestRejected, requireGmAdmin, type DeploymentEnvironment } from '@gm/domain';
import { executeAdminCommand } from '../admin/commands';
import { randomAreaId, randomQrId } from '../admin/ids';
import { importPeople, linkAccount, previewPeople, readPeople, readUnlisted, runReleaseJob } from '../admin/people';
import { readCalendar, readHealth, readPlaces } from '../admin/reads';
import {
  CommandRejected,
  executeCommand,
  type CommandStore,
  type MaintenanceCatalog,
  type PeopleDirectory,
  type RoutingDirectory,
} from '../commands/index';
import {
  ApiError,
  authenticate,
  countAwaitingConfirmation,
  createUploadUrl,
  createViewUrl,
  finalizeUpload,
  getRequestDetail,
  listComments,
  listGmHistory,
  listHistory,
  listMyRequests,
  listWaitingIntervals,
  markSeen,
  previewRelated,
  previewWaiting,
  publicContactSource,
  type ApiDeps,
  type Caller,
  type UploadPurpose,
  verifyCompanySignIn,
} from '../endpoints/index';
import { route as healthRoute } from '../routes';
import { corsDecision } from './cors';

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
  /** Request body cap (default 64 KiB; commands and file requests are small JSON). */
  readonly maxBodyBytes?: number;
  /** A11: suffix of a new area ID (default 12 random hex characters). */
  readonly newAreaId?: () => string;
  /** A11: a new QR code ID — 128 random bits, base64url (default `crypto.randomBytes`). */
  readonly newQrId?: () => string;
}


const DEFAULT_MAX_BODY_BYTES = 64 * 1024;
const ALLOWED_METHODS = 'GET, POST';
const ALLOWED_HEADERS = 'authorization, content-type';

type Reply = { readonly status: number; readonly body?: unknown; readonly headers?: Readonly<Record<string, string>> };
type Handler = (context: {
  readonly token: string | undefined;
  readonly body: () => Promise<Record<string, unknown>>;
  readonly params: readonly string[];
  readonly query: URLSearchParams;
}) => Promise<Reply>;

interface Route {
  readonly name: string;
  readonly method: 'GET' | 'POST';
  readonly pattern: RegExp;
  readonly handle: Handler;
  /** A10: a larger body for the people import (mapped rows of the whole staff list). */
  readonly maxBodyBytes?: number;
}

/** A10: up to MAX_IMPORT_ROWS mapped rows. */
const PEOPLE_IMPORT_MAX_BODY_BYTES = 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const SEGMENT = '([^/]+)';

/** Domain refusals → HTTP status; the code itself is returned to the client. */
const FORBIDDEN_CODES = new Set(['GM_ONLY', 'GM_ADMIN_ONLY', 'FLAG_NOT_ALLOWED', 'RELATED_NOT_ALLOWED', 'REQUESTER_ONLY', 'NOT_CURRENT_RECIPIENT']);
/**
 * A03: the command lost to a newer state; the answer carries the latest safe state (Part 6 §6.6).
 * A04: so does the waited party's answer that came after the GM resumed / changed the party, or
 * after another contact of the team answered first (A2.2).
 */
const CONFLICT_CODES = new Set([
  'COMMAND_ID_CONFLICT',
  'REVISION_CONFLICT',
  'ALREADY_ACCEPTED',
  'NOT_WAITING',
  'STALE_WAITING_INTERVAL',
  'ALREADY_RESPONDED',
  // D-A10-2: the Admin must confirm the latest count of open requests a GM holds.
  'OPEN_REQUESTS_ASSIGNED',
  // A11: the Admin's change clashes with what is there (Part 3 §13 states: keep the form, say why).
  'AREA_LABEL_TAKEN',
  'LOCATION_LABEL_TAKEN',
  'AREA_HAS_QR',
  'HOLIDAY_EXISTS',
  // A10: the last active GM Admin stays; a person already on the list.
  'LAST_GM_ADMIN',
  'PERSON_EXISTS',
]);
const NOT_FOUND_CODES = new Set(['REQUEST_NOT_FOUND', 'LOCATION_NOT_FOUND', 'AREA_NOT_FOUND', 'QR_NOT_FOUND', 'HOLIDAY_NOT_FOUND', 'PERSON_NOT_FOUND']);
const UNAVAILABLE_CODES = new Set(['ROUTING_NOT_CONFIGURED', 'CALENDAR_NOT_CONFIGURED', 'CATALOG_NOT_READY']);

function statusOfDomainCode(code: string): number {
  if (FORBIDDEN_CODES.has(code)) return 403;
  if (CONFLICT_CODES.has(code)) return 409;
  if (NOT_FOUND_CODES.has(code)) return 404;
  if (UNAVAILABLE_CODES.has(code)) return 503;
  return 422;
}

function bearer(header: string | undefined): string | undefined {
  if (header === undefined) return undefined;
  const match = /^Bearer\s+(\S+)$/.exec(header);
  return match?.[1];
}

function stringField(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== 'string') throw new ApiError(400, 'BODY_INVALID');
  return value;
}

async function readJson(request: IncomingMessage, limit: number): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > limit) throw new ApiError(413, 'BODY_TOO_LARGE');
    chunks.push(buffer);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ApiError(400, 'BODY_INVALID');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new ApiError(400, 'BODY_INVALID');
  return parsed as Record<string, unknown>;
}

const actorOf = (caller: Caller) => ({ personId: caller.viewer.personId, role: caller.viewer.role });

function routes(deps: HttpDeps): readonly Route[] {
  const { api } = deps;
  const publicContacts = publicContactSource(api);
  return [
    {
      // A09 / A1.3: the login page's contact box — no sign-in, no token read (the safe subset only).
      name: 'public.contact',
      method: 'GET',
      pattern: /^\/api\/public\/contact$/,
      handle: async () => ({ status: 200, body: { contacts: await publicContacts.get() } }),
    },
    {
      // A11: Admin pages (Part 3 §13) — GM Admin only, checked here on every call.
      name: 'admin.places',
      method: 'GET',
      pattern: /^\/api\/admin\/places$/,
      handle: async ({ token }) => {
        requireGmAdmin(actorOf(await authenticate(api, token)));
        return { status: 200, body: await readPlaces(api) };
      },
    },
    {
      name: 'admin.calendar',
      method: 'GET',
      pattern: /^\/api\/admin\/calendar$/,
      handle: async ({ token }) => {
        requireGmAdmin(actorOf(await authenticate(api, token)));
        return { status: 200, body: await readCalendar(api) };
      },
    },
    {
      name: 'admin.health',
      method: 'GET',
      pattern: /^\/api\/admin\/health$/,
      handle: async ({ token }) => {
        requireGmAdmin(actorOf(await authenticate(api, token)));
        return { status: 200, body: await readHealth(api) };
      },
    },
    {
      // A10 (Part 3 §13.3): the people list, a page at a time, searched by name or e-mail.
      name: 'admin.people',
      method: 'GET',
      pattern: /^\/api\/admin\/people$/,
      handle: async ({ token, query }) => {
        requireGmAdmin(actorOf(await authenticate(api, token)));
        const offset = Number(query.get('offset') ?? '0');
        return { status: 200, body: await readPeople(api, query.get('q') ?? '', Number.isFinite(offset) ? offset : 0) };
      },
    },
    {
      name: 'admin.unlisted_logins',
      method: 'GET',
      pattern: /^\/api\/admin\/unlisted-logins$/,
      handle: async ({ token }) => {
        requireGmAdmin(actorOf(await authenticate(api, token)));
        return { status: 200, body: await readUnlisted(api) };
      },
    },
    {
      name: 'admin.people_preview',
      method: 'POST',
      pattern: /^\/api\/admin\/people\/preview$/,
      maxBodyBytes: PEOPLE_IMPORT_MAX_BODY_BYTES,
      async handle({ token, body }) {
        requireGmAdmin(actorOf(await authenticate(api, token)));
        return { status: 200, body: await previewPeople(api, parsePeopleImportBody(await body())) };
      },
    },
    {
      name: 'admin.people_import',
      method: 'POST',
      pattern: /^\/api\/admin\/people\/import$/,
      maxBodyBytes: PEOPLE_IMPORT_MAX_BODY_BYTES,
      async handle({ token, body }) {
        const actor = actorOf(await authenticate(api, token));
        requireGmAdmin(actor);
        const input = parsePeopleImportBody(await body(), ['import_id']);
        if (typeof input.import_id !== 'string' || !UUID.test(input.import_id)) throw new ContractRejected('COMMAND_ID_INVALID', 'import_id', 'import_id must be a lowercase UUID');
        return { status: 200, body: await importPeople(api, deps.commandStore, input.import_id, input, { actorId: actor.personId, now: api.now() }) };
      },
    },
    {
      // A10 / D-A09-1: the first login — links a verified company e-mail on the list (never a name).
      name: 'me.link',
      method: 'POST',
      pattern: /^\/api\/me\/link$/,
      handle: async ({ token }) => ({ status: 200, body: await linkAccount(deps.commandStore, await verifyCompanySignIn(api, token), api.now()) }),
    },
    {
      name: 'admin.commands',
      method: 'POST',
      pattern: /^\/api\/admin\/commands$/,
      async handle({ token, body }) {
        const actor = actorOf(await authenticate(api, token));
        requireGmAdmin(actor);
        const command = parseAdminCommand(await body());
        const outcome = await executeAdminCommand(deps.commandStore, command, {
          actor,
          now: api.now(),
          newAreaId: deps.newAreaId ?? randomAreaId,
          newQrId: deps.newQrId ?? randomQrId,
        });
        // D-A10-2: the open requests of a GM just switched off are released now (the worker finishes
        // the job if this stops half way).
        const releaseJob = outcome.result.release_job;
        if (typeof releaseJob === 'string') {
          await runReleaseJob(deps.commandStore, releaseJob, { now: api.now(), directories: { peopleDirectory: deps.peopleDirectory, routingDirectory: deps.routingDirectory } });
        }
        return { status: 200, body: { replayed: outcome.replayed, result: outcome.result } };
      },
    },
    {
      name: 'commands.execute',
      method: 'POST',
      pattern: /^\/api\/commands$/,
      async handle({ token, body }) {
        const caller = await authenticate(api, token);
        const command = parseCommand(await body());
        const outcome = await executeCommand(deps.commandStore, command, {
          actor: { personId: caller.viewer.personId, role: caller.viewer.role },
          now: api.now(),
          environment: deps.environment,
          newRequestId: deps.newRequestId,
          maintenanceCatalog: deps.maintenanceCatalog,
          peopleDirectory: deps.peopleDirectory,
          routingDirectory: deps.routingDirectory,
        });
        if (outcome.outboxIds.length > 0) {
          try {
            await deps.taskQueue.enqueue(outcome.outboxIds);
          } catch {
            // The request is committed; its outbox stays `pending` for the recovery tick (A02).
            api.log.warn('outbox.enqueue_failed', { count: outcome.outboxIds.length });
          }
        }
        return { status: 200, body: { replayed: outcome.replayed, result: outcome.result } };
      },
    },
    {
      name: 'requests.detail',
      method: 'GET',
      pattern: new RegExp(`^/api/requests/${SEGMENT}$`),
      handle: async ({ token, params }) => ({ status: 200, body: await getRequestDetail(api, token, params[0]!) }),
    },
    {
      name: 'requests.history',
      method: 'GET',
      pattern: new RegExp(`^/api/requests/${SEGMENT}/history$`),
      handle: async ({ token, params }) => ({ status: 200, body: { items: await listHistory(api, token, params[0]!) } }),
    },
    {
      // D-A04-8: GM-only history (reason for removing the confidential flag).
      name: 'requests.gm_history',
      method: 'GET',
      pattern: new RegExp(`^/api/requests/${SEGMENT}/gm-history$`),
      handle: async ({ token, params }) => ({ status: 200, body: { items: await listGmHistory(api, token, params[0]!) } }),
    },
    {
      name: 'requests.waiting_intervals',
      method: 'GET',
      pattern: new RegExp(`^/api/requests/${SEGMENT}/waiting-intervals$`),
      handle: async ({ token, params }) => ({ status: 200, body: { items: await listWaitingIntervals(api, token, params[0]!) } }),
    },
    {
      // A04: confirm-sheet previews (F05 §9.2): read only, GM only; the command decides again.
      name: 'requests.waiting_preview',
      method: 'POST',
      pattern: new RegExp(`^/api/requests/${SEGMENT}/waiting-preview$`),
      handle: async ({ token, body, params }) => ({ status: 200, body: await previewWaiting(api, token, params[0]!, await body()) }),
    },
    {
      name: 'requests.related_preview',
      method: 'POST',
      pattern: new RegExp(`^/api/requests/${SEGMENT}/related-preview$`),
      handle: async ({ token, body, params }) => ({ status: 200, body: await previewRelated(api, token, params[0]!, await body()) }),
    },
    {
      name: 'requests.comments',
      method: 'GET',
      pattern: new RegExp(`^/api/requests/${SEGMENT}/comments$`),
      handle: async ({ token, params }) => ({ status: 200, body: { items: await listComments(api, token, params[0]!) } }),
    },
    {
      name: 'me.requests',
      method: 'GET',
      pattern: /^\/api\/me\/requests$/,
      handle: async ({ token }) => ({ status: 200, body: { items: await listMyRequests(api, token) } }),
    },
    {
      // A06: the screen showed the request up to this unread step (Part 2 Addendum A1.1).
      name: 'requests.seen',
      method: 'POST',
      pattern: /^\/api\/requests\/([^/]+)\/seen$/,
      async handle({ token, body, params }) {
        const input = await body();
        const keys = Object.keys(input);
        const seq = input.activity_seq;
        if (keys.length !== 1 || keys[0] !== 'activity_seq' || typeof seq !== 'number') throw new ApiError(400, 'BODY_INVALID');
        return { status: 200, body: await markSeen(api, token, params[0] ?? '', { activitySeq: seq }) };
      },
    },
    {
      name: 'me.awaiting_confirmation',
      method: 'GET',
      pattern: /^\/api\/me\/awaiting-confirmation$/,
      handle: async ({ token }) => ({ status: 200, body: await countAwaitingConfirmation(api, token) }),
    },
    {
      name: 'attachments.view_url',
      method: 'POST',
      pattern: /^\/api\/attachments\/view-url$/,
      async handle({ token, body }) {
        const input = await body();
        return { status: 200, body: await createViewUrl(api, token, { requestId: stringField(input, 'request_id'), objectPath: stringField(input, 'object_path') }) };
      },
    },
    {
      name: 'attachments.upload_url',
      method: 'POST',
      pattern: /^\/api\/attachments\/upload-url$/,
      async handle({ token, body }) {
        const input = await body();
        const size = input.size_bytes;
        if (typeof size !== 'number') throw new ApiError(400, 'BODY_INVALID');
        return {
          status: 200,
          body: await createUploadUrl(api, token, {
            requestId: stringField(input, 'request_id'),
            purpose: stringField(input, 'purpose') as UploadPurpose,
            contentType: stringField(input, 'content_type'),
            sizeBytes: size,
          }),
        };
      },
    },
    {
      name: 'attachments.finalize',
      method: 'POST',
      pattern: /^\/api\/attachments\/finalize$/,
      async handle({ token, body }) {
        const input = await body();
        return { status: 200, body: await finalizeUpload(api, token, { uploadId: stringField(input, 'upload_id') }) };
      },
    },
  ];
}

function errorReply(error: unknown): Reply & { readonly code: string } {
  if (error instanceof ApiError) return { status: error.status, body: { error: error.code }, code: error.code };
  if (error instanceof ContractRejected) return { status: 400, body: { error: error.code, path: error.path }, code: error.code };
  if (error instanceof CommandRejected && error.details !== undefined) {
    return { status: statusOfDomainCode(error.code), body: { error: error.code, current: error.details }, code: error.code };
  }
  if (error instanceof RequestRejected || error instanceof LifecycleRejected || error instanceof CommandRejected) {
    return { status: statusOfDomainCode(error.code), body: { error: error.code }, code: error.code };
  }
  return { status: 500, body: { error: 'INTERNAL' }, code: 'INTERNAL' };
}

export function createApiHandler(deps: HttpDeps): (request: IncomingMessage, response: ServerResponse) => void {
  const table = routes(deps);
  const limit = deps.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const log = deps.api.log;

  return (request, response) => {
    void (async () => {
      const method = request.method ?? 'GET';
      const path = new URL(request.url ?? '/', 'http://localhost').pathname;
      const cors = corsDecision(request.headers.origin, deps.allowedOrigins);
      let reply: Reply;
      let routeName = 'unknown';
      let code: string | undefined;
      try {
        if (method === 'OPTIONS') {
          routeName = 'cors.preflight';
          if (request.headers.origin === undefined || !cors.allowed) throw new ApiError(403, 'ORIGIN_NOT_ALLOWED');
          reply = {
            status: 204,
            headers: { 'access-control-allow-methods': ALLOWED_METHODS, 'access-control-allow-headers': ALLOWED_HEADERS, 'access-control-max-age': '600' },
          };
        } else if (path === '/healthz') {
          routeName = 'health';
          const health = healthRoute(method, path);
          reply = { status: health.status, body: health.body, ...(health.headers === undefined ? {} : { headers: health.headers }) };
        } else {
          if (!cors.allowed) throw new ApiError(403, 'ORIGIN_NOT_ALLOWED');
          const matches = table.map((candidate) => ({ candidate, match: candidate.pattern.exec(path) })).filter((entry) => entry.match !== null);
          const found = matches.find((entry) => entry.candidate.method === method);
          if (found === undefined) {
            if (matches.length > 0) {
              routeName = matches[0]!.candidate.name;
              reply = { status: 405, body: { error: 'METHOD_NOT_ALLOWED' }, headers: { allow: [...new Set(matches.map((entry) => entry.candidate.method))].join(', ') } };
              code = 'METHOD_NOT_ALLOWED';
            } else {
              throw new ApiError(404, 'NOT_FOUND');
            }
          } else {
            routeName = found.candidate.name;
            let cached: Promise<Record<string, unknown>> | undefined;
            const routeLimit = found.candidate.maxBodyBytes ?? limit;
            reply = await found.candidate.handle({
              token: bearer(request.headers.authorization),
              params: found.match!.slice(1),
              query: new URL(request.url ?? '/', 'http://localhost').searchParams,
              body: () => (cached ??= readJson(request, routeLimit)),
            });
          }
        }
      } catch (error) {
        const failed = errorReply(error);
        reply = failed;
        code = failed.code;
      }
      response.writeHead(reply.status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        ...cors.headers,
        ...reply.headers,
      });
      response.end(reply.status === 204 || method === 'HEAD' || reply.body === undefined ? undefined : JSON.stringify(reply.body));
      log.info('http.request', { route: routeName, status: reply.status, ...(code === undefined ? {} : { code }) });
    })();
  };
}
