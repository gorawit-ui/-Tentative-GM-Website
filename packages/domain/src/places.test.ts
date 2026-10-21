// A11 — locations, areas and their QR codes (Part 1 brief, Part 3 §13.1–13.2, Part 6 §6.2/§6.4,
// D-S08-3): the five locations and WH300's six areas as the seed; areas are closed, never deleted; one
// QR per area, a random code that cannot be guessed, moved to another area without printing again.
import { describe, expect, it } from 'vitest';
import {
  LifecycleRejected,
  PLACE_SEED,
  isQrId,
  placeLabelOf,
  planAreaActive,
  planMoveQr,
  planNewArea,
  planNewLocation,
  planQrActive,
  planQrForArea,
  planRenameArea,
  planRenameLocation,
  qrPrintMode,
  qrTargetUrl,
  requireGmAdmin,
  type AreaFacts,
  type LocationFacts,
  type QrFacts,
} from './index';

const rejected = (work: () => unknown) => {
  try {
    work();
  } catch (error) {
    if (error instanceof LifecycleRejected) return error.code;
    throw error;
  }
  return 'accepted';
};

const WH300: LocationFacts = { id: 'loc-wh300', label: 'WH300', active: true };
const FAC16: LocationFacts = { id: 'loc-fac16', label: 'FAC16', active: true };
const pack: AreaFacts = { id: 'area-wh300-pack-1', locationId: 'loc-wh300', label: 'ห้องแพ็คชั้น 1', active: true, qrId: 'Qr1234567890abcdefghij' };
const qa: AreaFacts = { id: 'area-wh300-qa-1', locationId: 'loc-wh300', label: 'ห้อง QA ชั้น 1', active: true };
const closed: AreaFacts = { id: 'area-wh300-old', locationId: 'loc-wh300', label: 'ห้องเก่า', active: false };
const qr: QrFacts = { id: 'Qr1234567890abcdefghij', areaId: pack.id, locationId: 'loc-wh300', active: true };

describe('PLACE_SEED (Part 1 brief)', () => {
  it('the five locations, shown with the same names in every part', () => {
    expect(PLACE_SEED.locations.map((location) => location.label)).toEqual(['WH300', 'FAC16', 'FAC17', 'Office 195', 'Cafe 222']);
    expect(PLACE_SEED.locations.map((location) => location.id)).toEqual(['loc-wh300', 'loc-fac16', 'loc-fac17', 'loc-office195', 'loc-cafe222']);
  });

  it('WH300 has its six areas; the other four are filled in by the Admin before real use', () => {
    expect(PLACE_SEED.areas.filter((area) => area.locationId === 'loc-wh300').map((area) => area.label)).toEqual([
      'ห้องแพ็คชั้น 1',
      'ห้อง QA ชั้น 1',
      'ออฟฟิศชั้น 2',
      'คลังสินค้าชั้น 3',
      'คลังสินค้าชั้น 4',
      'ห้องเก็บของชั้น 5',
    ]);
    expect(PLACE_SEED.areas.every((area) => area.locationId === 'loc-wh300')).toBe(true);
    expect(new Set(PLACE_SEED.areas.map((area) => area.id)).size).toBe(6);
    expect(PLACE_SEED.areas[0]?.id).toBe('area-wh300-pack-1');
  });
});

describe('locations — D-A11-4: the Admin adds and renames them; the ID never changes', () => {
  const all: LocationFacts[] = [WH300, FAC16, { id: 'loc-cafe222', label: 'Cafe 222', active: false }];

  it('a new location with a unique name, open', () => {
    expect(planNewLocation(all, '  คลังสินค้า  บางนา ')).toEqual({ label: 'คลังสินค้า บางนา', active: true });
  });

  it('a taken name (ignoring case and spaces, closed ones too) → LOCATION_LABEL_TAKEN; blank → LABEL_INVALID', () => {
    expect(rejected(() => planNewLocation(all, 'wh300'))).toBe('LOCATION_LABEL_TAKEN');
    expect(rejected(() => planNewLocation(all, 'Cafe  222'))).toBe('LOCATION_LABEL_TAKEN');
    expect(rejected(() => planNewLocation(all, ' '))).toBe('LABEL_INVALID');
  });

  it('rename: a new unique name for the same ID (its QR codes and open requests follow by ID)', () => {
    expect(planRenameLocation(FAC16, all, 'FAC16 (โรงงานใหม่)')).toEqual({ label: 'FAC16 (โรงงานใหม่)' });
    expect(planRenameLocation(FAC16, all, 'FAC16')).toEqual({ label: 'FAC16' });
    expect(rejected(() => planRenameLocation(FAC16, all, 'WH300'))).toBe('LOCATION_LABEL_TAKEN');
    expect(rejected(() => planRenameLocation(undefined, all, 'x'))).toBe('LOCATION_NOT_FOUND');
  });
});

describe('requireGmAdmin: every Admin change is GM Admin only (Part 3 §13, Part 6 §6.4)', () => {
  it.each(['requester', 'viewer', 'gm_staff'] as const)('%s → GM_ADMIN_ONLY', (role) => {
    expect(rejected(() => requireGmAdmin({ personId: 'someone@tdfb.co', role }))).toBe('GM_ADMIN_ONLY');
  });

  it('gm_admin passes', () => {
    expect(rejected(() => requireGmAdmin({ personId: 'admin@tdfb.co', role: 'gm_admin' }))).toBe('accepted');
  });
});

describe('placeLabelOf', () => {
  it('one trimmed line', () => {
    expect(placeLabelOf('  ห้อง   ซ่อม\nชั้น 2 ')).toBe('ห้อง ซ่อม ชั้น 2');
  });

  it.each([undefined, null, 3, '', '   ', 'ก'.repeat(61)])('blank, not text or longer than 60 → LABEL_INVALID (%j)', (value) => {
    expect(rejected(() => placeLabelOf(value))).toBe('LABEL_INVALID');
  });
});

describe('areas: add, rename, close — never delete (D-S08-3, §13.1)', () => {
  it('a new area of an active location', () => {
    expect(planNewArea(FAC16, [], ' ห้องประชุม ')).toEqual({ locationId: 'loc-fac16', label: 'ห้องประชุม', active: true });
  });

  it('same name in the same location (ignoring case and spaces), even a closed one → AREA_LABEL_TAKEN', () => {
    expect(rejected(() => planNewArea(WH300, [pack, qa, closed], 'ห้องแพ็คชั้น  1'))).toBe('AREA_LABEL_TAKEN');
    expect(rejected(() => planNewArea(WH300, [pack, qa, closed], 'ห้องเก่า'))).toBe('AREA_LABEL_TAKEN');
    expect(rejected(() => planNewArea(WH300, [{ ...qa, label: 'Office A' }], 'office a'))).toBe('AREA_LABEL_TAKEN');
  });

  it('the same name in another location is fine', () => {
    expect(planNewArea(FAC16, [], 'ห้องแพ็คชั้น 1').label).toBe('ห้องแพ็คชั้น 1');
  });

  it('no such location / a closed one → refused', () => {
    expect(rejected(() => planNewArea(undefined, [], 'ห้อง'))).toBe('LOCATION_NOT_FOUND');
    expect(rejected(() => planNewArea({ ...FAC16, active: false }, [], 'ห้อง'))).toBe('LOCATION_INACTIVE');
  });

  it('rename: a new unique name; the area keeps its ID, so old requests still point at it', () => {
    expect(planRenameArea(qa, [pack, qa], 'ห้อง QA ชั้น 1 (ใหม่)')).toEqual({ label: 'ห้อง QA ชั้น 1 (ใหม่)' });
    expect(rejected(() => planRenameArea(qa, [pack, qa], 'ห้องแพ็คชั้น 1'))).toBe('AREA_LABEL_TAKEN');
    // Its own name again is not a clash.
    expect(planRenameArea(qa, [pack, qa], 'ห้อง QA ชั้น 1')).toEqual({ label: 'ห้อง QA ชั้น 1' });
    expect(rejected(() => planRenameArea(undefined, [], 'x'))).toBe('AREA_NOT_FOUND');
  });

  it('close and open again: a flag, nothing is removed', () => {
    expect(planAreaActive(qa, false)).toEqual({ active: false });
    expect(planAreaActive(closed, true)).toEqual({ active: true });
    expect(rejected(() => planAreaActive(undefined, false))).toBe('AREA_NOT_FOUND');
  });
});

describe('QR: one per area, unguessable, moved without printing again (§13.2, Part 6 §6.2)', () => {
  it('a QR ID is 22 URL-safe characters (128 random bits)', () => {
    expect(isQrId('Qr1234567890abcdefghij')).toBe(true);
    expect(isQrId('A-b_C'.padEnd(22, 'x'))).toBe(true);
    for (const bad of ['', 'qr-acl-1', 'Qr1234567890abcdefghi', 'Qr1234567890abcdefghijk', 'Qr1234567890abcdefgh/j', 'Qr1234567890abcdefgh j', 42, undefined]) {
      expect(isQrId(bad)).toBe(false);
    }
  });

  it('the printed link has only the code: {base URL}/q/{qr_id} — no room name, no expiry', () => {
    expect(qrTargetUrl('https://gm.tdfb.co', 'Qr1234567890abcdefghij')).toBe('https://gm.tdfb.co/q/Qr1234567890abcdefghij');
    expect(qrTargetUrl('https://gm-dev.tdfb.co/', 'Qr1234567890abcdefghij')).toBe('https://gm-dev.tdfb.co/q/Qr1234567890abcdefghij');
    expect(qrTargetUrl('http://127.0.0.1:4173', 'Qr1234567890abcdefghij')).toBe('http://127.0.0.1:4173/q/Qr1234567890abcdefghij');
  });

  it.each(['http://gm.tdfb.co', 'https://gm.tdfb.co/app', 'ftp://gm.tdfb.co', 'gm.tdfb.co', ''])('a base URL that is not an https origin (or this machine) is refused: %j', (base) => {
    expect(() => qrTargetUrl(base, 'Qr1234567890abcdefghij')).toThrow(RangeError);
  });

  it('a code that is not a QR ID is refused', () => {
    expect(() => qrTargetUrl('https://gm.tdfb.co', '../admin')).toThrow(RangeError);
  });

  it('D-A11-3: print is a sample (watermarked) until the QR base URL is the configured production domain', () => {
    expect(qrPrintMode('https://gm.tdfb.co', 'https://gm.tdfb.co')).toBe('final');
    expect(qrPrintMode('https://gm.tdfb.co/', 'https://GM.tdfb.co')).toBe('final');
    // No production domain configured (the default until P7-INFRA-01): always a sample, even on gm.tdfb.co.
    expect(qrPrintMode('https://gm.tdfb.co', undefined)).toBe('sample');
    for (const base of ['https://gm-dev.tdfb.co', 'http://127.0.0.1:4173', 'https://tentative.web.app', '', undefined]) {
      expect(qrPrintMode(base, 'https://gm.tdfb.co')).toBe('sample');
    }
    expect(qrPrintMode('https://gm.tdfb.co', 'not a url')).toBe('sample');
  });

  it('a new QR only for an active area that has none', () => {
    expect(planQrForArea(qa)).toEqual({ areaId: qa.id, locationId: 'loc-wh300', active: true });
    expect(rejected(() => planQrForArea(pack))).toBe('AREA_HAS_QR');
    expect(rejected(() => planQrForArea(closed))).toBe('AREA_INACTIVE');
    expect(rejected(() => planQrForArea(undefined))).toBe('AREA_NOT_FOUND');
  });

  it('move: the same code now points at another active area without a QR (no reprint)', () => {
    expect(planMoveQr(qr, pack, qa)).toEqual({ areaId: qa.id, locationId: 'loc-wh300' });
    const fac16Area: AreaFacts = { id: 'area-fac16-1', locationId: 'loc-fac16', label: 'ห้องประชุม', active: true };
    expect(planMoveQr(qr, pack, fac16Area)).toEqual({ areaId: 'area-fac16-1', locationId: 'loc-fac16' });
    expect(rejected(() => planMoveQr(qr, pack, pack))).toBe('QR_SAME_AREA');
    expect(rejected(() => planMoveQr(qr, pack, { ...qa, qrId: 'Zz1234567890abcdefghij' }))).toBe('AREA_HAS_QR');
    expect(rejected(() => planMoveQr(qr, pack, closed))).toBe('AREA_INACTIVE');
    expect(rejected(() => planMoveQr(qr, pack, undefined))).toBe('AREA_NOT_FOUND');
    expect(rejected(() => planMoveQr(undefined, undefined, qa))).toBe('QR_NOT_FOUND');
  });

  it('turn a QR off / on (an off QR lets the person choose the place, A12)', () => {
    expect(planQrActive(qr, false)).toEqual({ active: false });
    expect(planQrActive({ ...qr, active: false }, true)).toEqual({ active: true });
    expect(rejected(() => planQrActive(undefined, true))).toBe('QR_NOT_FOUND');
  });
});
