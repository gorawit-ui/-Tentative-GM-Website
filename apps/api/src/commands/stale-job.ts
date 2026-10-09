// A05 — the stale check of one request, scheduled ahead (Part 6 §6.9): every write of a request
// stores `scheduled_work/stale-{id}` due at the first instant past 3 business days of the company
// calendar as it is now (FU-27 decision: a special holiday announced later counts). The tick then
// reads only due jobs, never every open request. A request that is no longer open needs no check:
// its job is superseded. The job carries the revision it was written for; the worker rechecks it.
import type { RequestRecord } from '@gm/contracts';
import { staleDueAt, type CalendarSnapshot, type Instant } from '@gm/time';

export const OPEN_FOR_STALE: ReadonlySet<string> = new Set(['queued', 'in_progress', 'waiting']);

export function staleJobPath(requestId: string): string {
  return `scheduled_work/stale-${requestId}`;
}

export function staleJobDocument(
  requestId: string,
  request: Pick<RequestRecord, 'status' | 'revision' | 'last_updated_at'>,
  calendar: CalendarSnapshot,
  now: Instant,
): Record<string, unknown> {
  const base = { kind: 'stale', attempts: 0, request_id: requestId, expected_revision: request.revision, created_at: now };
  if (!OPEN_FOR_STALE.has(request.status)) return { ...base, state: 'superseded', next_run_at: now, completed_at: now };
  return { ...base, state: 'scheduled', next_run_at: staleDueAt(request.last_updated_at, calendar) };
}
