// A13 — U1 “มีคนแจ้งเรื่องนี้แล้ว”: which open repair requests count as the same report as the place, area
// and symptom chosen at step 3. Compares the chosen values, never the GM-editable `summary_title`; only
// open (queued / in_progress / waiting), non-confidential repairs; “อื่นๆ” never. Areas given on both
// sides and different → not the same; “ไม่ระบุ” on either side → place + symptom (the person decides).
// A completed request waiting for confirmation cannot be watched (D-S08-7), so it is not offered. Pure;
// the API (and A14's recheck when sending) apply it to what they read.
import type { Instant } from '@gm/time';
import { reject, type RequestStatus } from './command-guards';
import { OTHER_SYMPTOM_KEY } from './maintenance-catalog';
import type { RequestType } from './request-creation';

export interface DuplicateCandidate {
  readonly requestId: string;
  readonly type: RequestType;
  readonly status: RequestStatus;
  readonly closedAt?: Instant | undefined;
  readonly isConfidential?: boolean | undefined;
  readonly locationId?: string | undefined;
  readonly areaId?: string | undefined;
  readonly symptomKey?: string | undefined;
  readonly createdAt: Instant;
}

/** What was chosen in the form; no `areaId` = “ไม่ระบุ”. */
export interface DuplicateSelection {
  readonly locationId: string;
  readonly areaId?: string | undefined;
  readonly symptomKey: string;
}

export const DUPLICATE_OPEN_STATUSES: readonly RequestStatus[] = ['queued', 'in_progress', 'waiting'];

export function isDuplicateMatch(candidate: DuplicateCandidate, selection: DuplicateSelection): boolean {
  if (selection.symptomKey === OTHER_SYMPTOM_KEY) return false;
  if (candidate.type !== 'maintenance' || candidate.isConfidential === true) return false;
  if (!DUPLICATE_OPEN_STATUSES.includes(candidate.status) || candidate.closedAt !== undefined) return false;
  if (candidate.locationId !== selection.locationId || candidate.symptomKey !== selection.symptomKey) return false;
  return candidate.areaId === undefined || selection.areaId === undefined || candidate.areaId === selection.areaId;
}

/** The matches, the first report first. */
export function duplicateMatches<C extends DuplicateCandidate>(candidates: readonly C[], selection: DuplicateSelection): C[] {
  return candidates
    .filter((candidate) => isDuplicateMatch(candidate, selection))
    .sort((a, b) => a.createdAt - b.createdAt || (a.requestId < b.requestId ? -1 : a.requestId > b.requestId ? 1 : 0));
}

export type DuplicateViewer = 'requester' | 'watcher' | 'none';

/** How the reader relates to a match: their own report, already watching, or neither. */
export function viewerRelation(request: { readonly requesterId?: string | undefined; readonly watcherIds: readonly string[] }, personId: string): DuplicateViewer {
  if (request.requesterId === personId) return 'requester';
  return request.watcherIds.includes(personId) ? 'watcher' : 'none';
}

/** The one optional note sent with a watch (U1; the prototype's 1,000 characters). */
export const MAX_WATCH_NOTE_CHARS = 1000;

export function watchNote(text: string | undefined): string | undefined {
  const note = text?.trim();
  if (note === undefined || note === '') return undefined;
  if ([...note].length > MAX_WATCH_NOTE_CHARS) reject('NOTE_TOO_LONG', `A note is up to ${MAX_WATCH_NOTE_CHARS} characters`);
  return note;
}

/** A14 / FU-49: at most this many “ไม่ใช่” answers travel with a request (one form's interstitials). */
export const MAX_KNOWN_DUPLICATES = 20;

/** The matches found when sending that the person has not answered “ไม่ใช่” to yet (U1: not asked twice). */
export function unansweredDuplicates(matchIds: readonly string[], knownIds: readonly string[]): string[] {
  const known = new Set(knownIds);
  return matchIds.filter((id) => !known.has(id));
}
