// A11 — locations, areas and their QR codes (Part 1 brief, Part 3 §13.1–13.2, Part 6 §6.2/§6.4,
// D-S08-3). Pure rules; the API reads the documents, asks these, then writes in one transaction.
// - The seed is the brief: five locations, WH300's six areas; the other four get theirs from the Admin.
// - Areas and locations are closed (`active: false`), never deleted: old requests keep their place.
// - One QR code per area. The code is random (128 bits) and is the whole link `{base}/q/{qr_id}`: no
//   room name, no expiry, so it can point at another area later without printing again.
import { reject } from './command-guards';
import type { Actor } from './request-creation';

export interface SeedLocation {
  readonly id: string;
  readonly label: string;
  readonly order: number;
}

export interface SeedArea {
  readonly id: string;
  readonly locationId: string;
  readonly label: string;
  readonly order: number;
}

/** Part 1 brief: “WH300 / FAC16 / FAC17 / Office 195 / Cafe 222”, WH300's six areas. */
export const PLACE_SEED: { readonly locations: readonly SeedLocation[]; readonly areas: readonly SeedArea[] } = {
  locations: [
    { id: 'loc-wh300', label: 'WH300', order: 1 },
    { id: 'loc-fac16', label: 'FAC16', order: 2 },
    { id: 'loc-fac17', label: 'FAC17', order: 3 },
    { id: 'loc-office195', label: 'Office 195', order: 4 },
    { id: 'loc-cafe222', label: 'Cafe 222', order: 5 },
  ],
  areas: [
    { id: 'area-wh300-pack-1', locationId: 'loc-wh300', label: 'ห้องแพ็คชั้น 1', order: 1 },
    { id: 'area-wh300-qa-1', locationId: 'loc-wh300', label: 'ห้อง QA ชั้น 1', order: 2 },
    { id: 'area-wh300-office-2', locationId: 'loc-wh300', label: 'ออฟฟิศชั้น 2', order: 3 },
    { id: 'area-wh300-store-3', locationId: 'loc-wh300', label: 'คลังสินค้าชั้น 3', order: 4 },
    { id: 'area-wh300-store-4', locationId: 'loc-wh300', label: 'คลังสินค้าชั้น 4', order: 5 },
    { id: 'area-wh300-storage-5', locationId: 'loc-wh300', label: 'ห้องเก็บของชั้น 5', order: 6 },
  ],
};

export interface LocationFacts {
  readonly id: string;
  readonly label: string;
  readonly active: boolean;
}

export interface AreaFacts {
  readonly id: string;
  readonly locationId: string;
  readonly label: string;
  readonly active: boolean;
  /** The area's QR code, if it has one. */
  readonly qrId?: string | undefined;
}

export interface QrFacts {
  readonly id: string;
  readonly areaId: string;
  readonly locationId: string;
  readonly active: boolean;
}

/** Part 3 §13: every Admin page and change is GM Admin only; the API checks, not the menu. */
export function requireGmAdmin(actor: Actor): void {
  if (actor.role !== 'gm_admin') reject('GM_ADMIN_ONLY', 'Only GM Admin can change Admin settings');
}

export const MAX_PLACE_LABEL_CHARS = 60;

/** A location or area name: one trimmed line of 1–60 characters. */
export function placeLabelOf(value: unknown): string {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (text === '' || [...text].length > MAX_PLACE_LABEL_CHARS) reject('LABEL_INVALID', 'A name is one line of 1–60 characters');
  return text;
}

/** Names compare without case and extra spaces. */
const sameLabel = (a: string, b: string) => a.replace(/\s+/g, ' ').trim().toLowerCase() === b.replace(/\s+/g, ' ').trim().toLowerCase();

function requireFreeLabel(label: string, siblings: readonly AreaFacts[], except?: string): void {
  if (siblings.some((area) => area.id !== except && sameLabel(area.label, label))) reject('AREA_LABEL_TAKEN', 'This location already has an area with that name');
}

/** A new area; `siblings` = every area of the location, closed ones too (names stay taken). */
export function planNewArea(location: LocationFacts | undefined, siblings: readonly AreaFacts[], label: unknown) {
  if (location === undefined) return reject('LOCATION_NOT_FOUND', 'No such location');
  if (!location.active) return reject('LOCATION_INACTIVE', 'A closed location takes no new area');
  const name = placeLabelOf(label);
  requireFreeLabel(name, siblings);
  return { locationId: location.id, label: name, active: true as const };
}

export function planRenameArea(area: AreaFacts | undefined, siblings: readonly AreaFacts[], label: unknown): { readonly label: string } {
  if (area === undefined) return reject('AREA_NOT_FOUND', 'No such area');
  const name = placeLabelOf(label);
  requireFreeLabel(name, siblings, area.id);
  return { label: name };
}

/** D-S08-3: closing keeps the document (and every reference to it). */
export function planAreaActive(area: AreaFacts | undefined, active: boolean): { readonly active: boolean } {
  if (area === undefined) return reject('AREA_NOT_FOUND', 'No such area');
  return { active };
}

/** D-A11-4: a new location; `all` = every location, closed ones too (names stay taken). */
export function planNewLocation(all: readonly LocationFacts[], label: unknown): { readonly label: string; readonly active: true } {
  const name = placeLabelOf(label);
  if (all.some((location) => sameLabel(location.label, name))) reject('LOCATION_LABEL_TAKEN', 'There is already a location with that name');
  return { label: name, active: true };
}

/** D-A11-4: a new name, same ID — its areas, QR codes and requests point at the ID. */
export function planRenameLocation(location: LocationFacts | undefined, all: readonly LocationFacts[], label: unknown): { readonly label: string } {
  if (location === undefined) return reject('LOCATION_NOT_FOUND', 'No such location');
  const name = placeLabelOf(label);
  if (all.some((other) => other.id !== location.id && sameLabel(other.label, name))) reject('LOCATION_LABEL_TAKEN', 'There is already a location with that name');
  return { label: name };
}

export function planLocationActive(location: LocationFacts | undefined, active: boolean): { readonly active: boolean } {
  if (location === undefined) return reject('LOCATION_NOT_FOUND', 'No such location');
  return { active };
}

/** 128 random bits as base64url: 22 characters of A–Z a–z 0–9 `-` `_`. */
const QR_ID = /^[A-Za-z0-9_-]{22}$/;

export function isQrId(value: unknown): value is string {
  return typeof value === 'string' && QR_ID.test(value);
}

/** One code per area, for an open area only. */
export function planQrForArea(area: AreaFacts | undefined) {
  if (area === undefined) return reject('AREA_NOT_FOUND', 'No such area');
  if (!area.active) return reject('AREA_INACTIVE', 'A closed area gets no QR code');
  if (area.qrId !== undefined) return reject('AREA_HAS_QR', 'This area already has a QR code');
  return { areaId: area.id, locationId: area.locationId, active: true as const };
}

/** The same code now opens another open area that has no code yet (nothing to reprint). */
export function planMoveQr(qr: QrFacts | undefined, _from: AreaFacts | undefined, to: AreaFacts | undefined): { readonly areaId: string; readonly locationId: string } {
  if (qr === undefined) return reject('QR_NOT_FOUND', 'No such QR code');
  if (to === undefined) return reject('AREA_NOT_FOUND', 'No such area');
  if (to.id === qr.areaId) return reject('QR_SAME_AREA', 'The QR code already opens this area');
  if (!to.active) return reject('AREA_INACTIVE', 'A closed area gets no QR code');
  if (to.qrId !== undefined) return reject('AREA_HAS_QR', 'That area already has a QR code');
  return { areaId: to.id, locationId: to.locationId };
}

/** An off code stays printed; the landing page then lets the person choose the place (A12). */
export function planQrActive(qr: QrFacts | undefined, active: boolean): { readonly active: boolean } {
  if (qr === undefined) return reject('QR_NOT_FOUND', 'No such QR code');
  return { active };
}

export const QR_PATH = '/q/';

/** The origin a QR link starts with: https, or this machine (emulator runs) — no path. */
function baseOrigin(baseUrl: string): string {
  const match = /^(https:\/\/[a-z0-9.-]+(?::\d{1,5})?|http:\/\/(?:127\.0\.0\.1|localhost)(?::\d{1,5})?)\/?$/i.exec(baseUrl);
  if (match?.[1] === undefined) throw new RangeError('QR base URL must be an https origin (or this machine for local runs)');
  return match[1].toLowerCase();
}

/** `{base URL}/q/{qr_id}` — only the code; the area is looked up when it is scanned. */
export function qrTargetUrl(baseUrl: string, qrId: string): string {
  if (!isQrId(qrId)) throw new RangeError('not a QR code ID');
  return `${baseOrigin(baseUrl)}${QR_PATH}${qrId}`;
}

/**
 * A QR printed with a temporary domain stops working when the app moves to the real one, so the print
 * page is a watermarked sample until the base URL is the production domain. D-A11-3: that domain comes
 * from config (proposed https://gm.tdfb.co, confirmed at P7-INFRA-01) — unset means always a sample.
 */
export function qrPrintMode(baseUrl: string | undefined, prodBaseUrl: string | undefined): 'final' | 'sample' {
  if (baseUrl === undefined || prodBaseUrl === undefined) return 'sample';
  try {
    return baseOrigin(baseUrl) === baseOrigin(prodBaseUrl) ? 'final' : 'sample';
  } catch {
    return 'sample';
  }
}
