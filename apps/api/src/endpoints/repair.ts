// A12 — what the repair form reads (UI-03 steps 1–3, F01, FU-21, FU-43). Every signed-in active account
// may report a repair (D-S04-6), so these need sign-in but no role; before login nothing is answered
// (Part 6 §6.4: the QR page sends the person to login first and keeps the code in the return address).
//   GET /api/repair/options   active places (Admin order), their active areas, the brief's symptoms —
//                             or 503 with why the form cannot take a request yet (FU-21, D-A01-2)
//   GET /api/repair/qr/:id    what a scanned code points at, or why it cannot be used (F01: a code
//                             that cannot be used fills nothing in; an open place is kept)
//   GET /api/repair/duplicates?location_id&area_id&symptom_key
//                             A13 / U1 “มีคนแจ้งเรื่องนี้แล้ว”: the open public repairs that match what was
//                             chosen (A14 asks again when sending), as public summary fields plus how
//                             the reader relates to each — never who else reported or watches
// Bounded reads (50 places, 1,000 areas, 20 matches); labels and IDs only.
import type { Firestore } from 'firebase-admin/firestore';
import { fromStored } from '../firestore/admin-store';
import { DUPLICATE_OPEN_STATUSES, MAINTENANCE_SYMPTOMS, duplicateMatches, isQrId, viewerRelation, type DuplicateSelection, type DuplicateViewer, type RequestStatus, type RequestType } from '@gm/domain';
import type { ApiDeps } from './deps';
import { ApiError } from './errors';
import { authenticate } from './authenticate';

export const MAX_REPAIR_LOCATIONS = 50;
export const MAX_REPAIR_AREAS = 1000;

const orderOf = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER);
const byOrder = (a: { order: number; id: string }, b: { order: number; id: string }) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export async function readRepairOptions(api: ApiDeps, token: string | undefined) {
  await authenticate(api, token);
  const [locations, areas, routing, calendar] = await Promise.all([
    api.db.collection('locations').limit(MAX_REPAIR_LOCATIONS).get(),
    api.db.collection('areas').where('active', '==', true).limit(MAX_REPAIR_AREAS).get(),
    api.db.doc('settings/routing').get(),
    api.db.doc('calendars/company').get(),
  ]);
  const open = locations.docs
    .map((doc) => ({ id: doc.id, data: doc.data() }))
    .filter(({ data }) => data.active === true && typeof data.label === 'string')
    .map(({ id, data }) => ({ id, label: data.label as string, order: orderOf(data.order) }))
    .sort(byOrder);
  if (open.length === 0) throw new ApiError(503, 'PLACES_NOT_SET_UP');
  if (!routing.exists) throw new ApiError(503, 'ROUTING_NOT_CONFIGURED');
  if (!calendar.exists) throw new ApiError(503, 'CALENDAR_NOT_CONFIGURED');
  const placeOrder = new Map(open.map((location, index) => [location.id, index]));
  const openAreas = areas.docs
    .map((doc) => ({ id: doc.id, data: doc.data() }))
    .filter(({ data }) => typeof data.label === 'string' && placeOrder.has(String(data.location_id)))
    .map(({ id, data }) => ({ id, location_id: String(data.location_id), label: data.label as string, order: orderOf(data.order), place: placeOrder.get(String(data.location_id)) ?? 0 }))
    .sort((a, b) => a.place - b.place || byOrder(a, b));
  return {
    locations: open.map(({ id, label }) => ({ id, label })),
    areas: openAreas.map(({ id, location_id, label }) => ({ id, location_id, label })),
    symptoms: MAINTENANCE_SYMPTOMS.map(({ key, label }) => ({ key, label })),
  };
}

export type QrState =
  | { readonly state: 'ok'; readonly location_id: string; readonly area_id: string }
  | { readonly state: 'not_found' | 'qr_inactive' | 'location_inactive' }
  | { readonly state: 'area_inactive'; readonly location_id: string };

export async function readQrState(api: ApiDeps, token: string | undefined, qrId: string): Promise<QrState> {
  await authenticate(api, token);
  if (!isQrId(qrId)) return { state: 'not_found' };
  const qr = (await api.db.doc(`qr_codes/${qrId}`).get()).data();
  if (qr === undefined || typeof qr.location_id !== 'string' || typeof qr.area_id !== 'string') return { state: 'not_found' };
  if (qr.active !== true) return { state: 'qr_inactive' };
  const [location, area] = await Promise.all([api.db.doc(`locations/${qr.location_id}`).get(), api.db.doc(`areas/${qr.area_id}`).get()]);
  if (location.data()?.active !== true) return { state: 'location_inactive' };
  if (area.data()?.active !== true || area.data()?.location_id !== qr.location_id) return { state: 'area_inactive', location_id: qr.location_id };
  return { state: 'ok', location_id: qr.location_id, area_id: qr.area_id };
}

/** At most this many open requests per place + symptom are read (and offered). */
export const MAX_DUPLICATE_MATCHES = 20;

export interface DuplicateMatch {
  readonly request_id: string;
  readonly request_number: string;
  readonly summary_title: string;
  readonly status: RequestStatus;
  readonly is_assigned: boolean;
  readonly assignee_label?: string;
  readonly location_label?: string;
  readonly area_label?: string;
  readonly watcher_count: number;
  readonly created_at: number;
  readonly viewer: DuplicateViewer;
}

const text = (value: unknown) => (typeof value === 'string' && value !== '' ? value : undefined);
const symptomKnown = (key: string) => MAINTENANCE_SYMPTOMS.some((symptom) => symptom.key === key);
const ids = (value: unknown) => (Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []);

/**
 * U1: the open public repairs matching `selection`, for `personId`. Reads the public summaries (a
 * confidential request has none), then each match's record for the confidential flag and the
 * requester, and the GM-only details for the watchers — only to say how the reader relates to it.
 * Exported for A14's recheck when the request is sent.
 */
export async function findDuplicateMatches(db: Firestore, personId: string, selection: DuplicateSelection): Promise<DuplicateMatch[]> {
  if (!symptomKnown(selection.symptomKey)) return [];
  const summaries = await db
    .collection('request_summaries')
    .where('location_id', '==', selection.locationId)
    .where('symptom_key', '==', selection.symptomKey)
    .where('status', 'in', [...DUPLICATE_OPEN_STATUSES])
    .limit(MAX_DUPLICATE_MATCHES)
    .get();
  const candidates = await Promise.all(
    summaries.docs.map(async (doc) => {
      // Instants are stored as Timestamps: read back as epoch milliseconds like everywhere else.
      const summary = fromStored(doc.data());
      const [request, details] = await Promise.all([db.doc(`requests/${doc.id}`).get(), db.doc(`gm_request_details/${doc.id}`).get()]);
      const record = request.exists ? fromStored(request.data() ?? {}) : undefined;
      return {
        requestId: doc.id,
        summary,
        type: summary.type as RequestType,
        status: summary.status as RequestStatus,
        closedAt: typeof summary.closed_at === 'number' ? summary.closed_at : undefined,
        // No record, or one that does not say “not confidential”, is never offered.
        isConfidential: record === undefined || record.is_confidential !== false,
        locationId: text(summary.location_id),
        areaId: text(summary.area_id),
        symptomKey: text(summary.symptom_key),
        createdAt: typeof summary.created_at === 'number' ? summary.created_at : 0,
        requesterId: text(record?.requester_id),
        watcherIds: ids(details.data()?.watcher_ids),
      };
    }),
  );
  const matches = duplicateMatches(candidates, selection);
  const placePaths = [...new Set(matches.flatMap((match) => [`locations/${match.locationId}`, ...(match.areaId === undefined ? [] : [`areas/${match.areaId}`])]))];
  const labels = new Map(await Promise.all(placePaths.map(async (path) => [path, text((await db.doc(path).get()).data()?.label)] as const)));
  return matches.map((match) => {
    const location = labels.get(`locations/${match.locationId}`);
    const area = match.areaId === undefined ? undefined : labels.get(`areas/${match.areaId}`);
    const assignee = text(match.summary.assignee_label);
    return {
      request_id: match.requestId,
      request_number: String(match.summary.request_number),
      summary_title: String(match.summary.summary_title),
      status: match.status,
      is_assigned: match.summary.is_assigned === true,
      ...(assignee === undefined ? {} : { assignee_label: assignee }),
      ...(location === undefined ? {} : { location_label: location }),
      ...(area === undefined ? {} : { area_label: area }),
      watcher_count: typeof match.summary.watcher_count === 'number' ? match.summary.watcher_count : 0,
      created_at: match.createdAt,
      viewer: viewerRelation(match, personId),
    };
  });
}

const QUERY_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export async function readRepairDuplicates(api: ApiDeps, token: string | undefined, query: URLSearchParams): Promise<{ readonly matches: DuplicateMatch[] }> {
  const caller = await authenticate(api, token);
  const locationId = query.get('location_id') ?? '';
  const areaId = query.get('area_id') ?? '';
  const symptomKey = query.get('symptom_key') ?? '';
  if (!QUERY_ID.test(locationId) || (areaId !== '' && !QUERY_ID.test(areaId)) || !symptomKnown(symptomKey)) throw new ApiError(400, 'QUERY_INVALID');
  return { matches: await findDuplicateMatches(api.db, caller.viewer.personId, { locationId, ...(areaId === '' ? {} : { areaId }), symptomKey }) };
}
