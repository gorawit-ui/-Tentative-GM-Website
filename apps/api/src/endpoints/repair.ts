// A12 — what the repair form reads (UI-03 steps 1–3, F01, FU-21, FU-43). Every signed-in active account
// may report a repair (D-S04-6), so these need sign-in but no role; before login nothing is answered
// (Part 6 §6.4: the QR page sends the person to login first and keeps the code in the return address).
//   GET /api/repair/options   active places (Admin order), their active areas, the brief's symptoms —
//                             or 503 with why the form cannot take a request yet (FU-21, D-A01-2)
//   GET /api/repair/qr/:id    what a scanned code points at, or why it cannot be used (F01: a code
//                             that cannot be used fills nothing in; an open place is kept)
// Bounded reads (50 places, 1,000 areas); labels and IDs only.
import { MAINTENANCE_SYMPTOMS, isQrId } from '@gm/domain';
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
