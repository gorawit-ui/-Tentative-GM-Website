// A02 — the worker's routes (Part 6 §6.2: gm-worker is IAM-authenticated on Cloud Run; Scheduler and
// Cloud Tasks call it with OIDC from their service accounts; there is no public tick).
//   POST /internal/tick           one tick (the single Scheduler job; dev: manual tick)
//   POST /internal/tasks/outbox   send these outbox entries (Cloud Tasks after the create commit)
//   GET  /healthz
export const TICK_PATH = '/internal/tick';
export const OUTBOX_TASK_PATH = '/internal/tasks/outbox';
/** Outbox IDs per task (one create writes at most one entry per GM plus the requester). */
export const MAX_TASK_IDS = 50;

const OUTBOX_ID = /^[0-9a-f]{40}$/;

export class TaskRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaskRejected';
  }
}

/** `{ "outbox_ids": [<40 hex>…] }`, 1–50 IDs, nothing else; duplicates removed. */
export function parseOutboxTask(body: unknown): string[] {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new TaskRejected('task body must be an object');
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== 'outbox_ids') throw new TaskRejected('task body takes outbox_ids only');
  const ids = (body as { outbox_ids: unknown }).outbox_ids;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_TASK_IDS) throw new TaskRejected(`outbox_ids must list 1–${MAX_TASK_IDS} IDs`);
  if (!ids.every((id): id is string => typeof id === 'string' && OUTBOX_ID.test(id))) throw new TaskRejected('outbox_ids must be outbox document IDs');
  return [...new Set(ids)];
}
