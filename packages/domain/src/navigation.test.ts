// A09 — which areas of the web app a signed-in person may open (Part 2 §2–3, Part 3 §0.2, D-S04-6).
// The web hides what a role cannot use and refuses the URL as well; the API and Rules still decide
// every read and command — this only keeps the screens honest.
import { describe, expect, it } from 'vitest';
import { ADMIN_SECTIONS, APP_AREAS, canOpenArea, navigationFor, type AppArea, type NavigationViewer } from './index';

const viewer = (role: NavigationViewer['role'], enabled = true): NavigationViewer => ({ role, enabled });
const PRIMARY: readonly AppArea[] = ['home', 'my_requests', 'repair', 'board', 'team'];

describe('navigationFor: the menu of each role', () => {
  it('requester: หน้าแรก / คำขอของฉัน / แจ้งซ่อม / บอร์ด / ติดต่อ GM; no GM button, no Admin', () => {
    expect(navigationFor(viewer('requester'))).toEqual({ primary: PRIMARY, gm: [], admin: [] });
  });

  it('D-S04-6: a Viewer opens their own requests too, so the same five items (newer than Part 3 §0.2)', () => {
    expect(navigationFor(viewer('viewer'))).toEqual({ primary: PRIMARY, gm: [], admin: [] });
  });

  it('GM Staff: the same five plus “สร้างงาน GM / เปิดแทน”; no Admin', () => {
    expect(navigationFor(viewer('gm_staff'))).toEqual({ primary: PRIMARY, gm: ['gm_create'], admin: [] });
  });

  it('GM Admin: as GM Staff plus the five Admin pages of phase A', () => {
    expect(navigationFor(viewer('gm_admin'))).toEqual({ primary: PRIMARY, gm: ['gm_create'], admin: ['locations', 'qr', 'users', 'calendars', 'content'] });
    expect(ADMIN_SECTIONS).toEqual(['locations', 'qr', 'users', 'calendars', 'content']);
  });

  it.each([undefined, viewer('gm_admin', false), viewer('requester', false)])('no account or a disabled one → no menu at all (%o)', (who) => {
    expect(navigationFor(who)).toEqual({ primary: [], gm: [], admin: [] });
  });
});

describe('canOpenArea: the URL is refused as well, not only hidden', () => {
  const table: readonly [AppArea, readonly NavigationViewer['role'][]][] = [
    ['home', ['requester', 'viewer', 'gm_staff', 'gm_admin']],
    ['my_requests', ['requester', 'viewer', 'gm_staff', 'gm_admin']],
    ['repair', ['requester', 'viewer', 'gm_staff', 'gm_admin']],
    ['board', ['requester', 'viewer', 'gm_staff', 'gm_admin']],
    ['team', ['requester', 'viewer', 'gm_staff', 'gm_admin']],
    // The page opens for everyone; what it shows is decided per request by the API (summary vs detail).
    ['request_detail', ['requester', 'viewer', 'gm_staff', 'gm_admin']],
    ['gm_create', ['gm_staff', 'gm_admin']],
    ['gm_on_behalf', ['gm_staff', 'gm_admin']],
    ['admin', ['gm_admin']],
  ];

  it('covers every area', () => {
    expect(table.map(([area]) => area)).toEqual([...APP_AREAS]);
  });

  it.each(table)('%s opens for %j only', (area, allowed) => {
    for (const role of ['requester', 'viewer', 'gm_staff', 'gm_admin'] as const) {
      expect(canOpenArea(viewer(role), area)).toBe(allowed.includes(role));
      expect(canOpenArea(viewer(role, false), area)).toBe(false);
    }
    expect(canOpenArea(undefined, area)).toBe(false);
  });
});
