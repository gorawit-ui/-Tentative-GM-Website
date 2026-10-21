// A09 — the phase A routes of Part 2 §3.1 and the area each belongs to; URL parameters are context, not
// permission (the area is then checked with canOpenArea, and the API checks again).
import { describe, expect, it } from 'vitest';
import { GM_CREATE_PATH, REPAIR_PATH, hidesBottomNav, routeOf } from './routes';

describe('routeOf', () => {
  it.each([
    ['/', '', { area: 'home' }],
    ['/my-requests', '', { area: 'my_requests' }],
    ['/requests/new', '?type=maintenance&origin=requester', { area: 'repair' }],
    ['/requests/new', '?origin=requester&type=maintenance', { area: 'repair' }],
    ['/requests/new', '?type=gm_task&origin=gm_initiated', { area: 'gm_create' }],
    ['/requests/new', '?type=maintenance&origin=gm_on_behalf', { area: 'gm_on_behalf' }],
    ['/requests/req-0427', '', { area: 'request_detail', requestId: 'req-0427' }],
    ['/board', '', { area: 'board' }],
    ['/team', '', { area: 'team' }],
    ['/admin/locations', '', { area: 'admin', section: 'locations' }],
    ['/admin/qr', '', { area: 'admin', section: 'qr' }],
    ['/admin/users', '', { area: 'admin', section: 'users' }],
    ['/admin/calendars', '', { area: 'admin', section: 'calendars' }],
    ['/admin/content', '', { area: 'admin', section: 'content' }],
  ] as const)('%s%s → %o', (pathname, search, expected) => {
    expect(routeOf(pathname, search)).toEqual(expected);
  });

  it.each([
    ['/requests/new', ''],
    ['/requests/new', '?type=gm_task&origin=requester'],
    ['/requests/new', '?type=document_request&origin=requester'],
    ['/admin', ''],
    ['/admin/sla', ''],
    ['/admin/users/extra', ''],
    ['/dashboard', ''],
    ['/q/qr-1', ''],
    ['/requests/', ''],
  ])('%s%s → not a phase A page', (pathname, search) => {
    expect(routeOf(pathname, search)).toEqual({ area: 'not_found' });
  });

  it('the paths the menus link to are the ones routeOf knows', () => {
    const [repairPath, repairSearch] = REPAIR_PATH.split('?');
    expect(routeOf(repairPath ?? '', `?${repairSearch}`)).toEqual({ area: 'repair' });
    const [gmPath, gmSearch] = GM_CREATE_PATH.split('?');
    expect(routeOf(gmPath ?? '', `?${gmSearch}`)).toEqual({ area: 'gm_create' });
  });
});

describe('hidesBottomNav (Part 5 Patch F6: the whole repair form)', () => {
  it.each([
    [{ area: 'repair' }, true],
    [{ area: 'gm_on_behalf' }, true],
    [{ area: 'gm_create' }, false],
    [{ area: 'home' }, false],
    [{ area: 'board' }, false],
  ] as const)('%o → %s', (route, hidden) => {
    expect(hidesBottomNav(route)).toBe(hidden);
  });
});
