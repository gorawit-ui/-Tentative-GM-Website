// A09 — the phase A routes of Part 2 §3.1 and the area each one belongs to. Query parameters are the
// context of the page, never a permission: the area is checked with `canOpenArea`, and the API checks
// every read and command again.
import { ADMIN_SECTIONS, type AdminSection, type AppArea } from '@gm/domain';

export type AppRoute =
  | { readonly area: Exclude<AppArea, 'request_detail' | 'admin'> }
  | { readonly area: 'request_detail'; readonly requestId: string }
  | { readonly area: 'admin'; readonly section: AdminSection }
  | { readonly area: 'not_found' };

export const HOME_PATH = '/';
export const MY_REQUESTS_PATH = '/my-requests';
export const REPAIR_PATH = '/requests/new?type=maintenance&origin=requester';
export const GM_CREATE_PATH = '/requests/new?type=gm_task&origin=gm_initiated';
export const ON_BEHALF_PATH = '/requests/new?type=maintenance&origin=gm_on_behalf';
export const BOARD_PATH = '/board';
export const TEAM_PATH = '/team';
export const adminPath = (section: AdminSection) => `/admin/${section}`;

/** The path each menu entry links to. */
export const AREA_PATHS: Readonly<Record<Exclude<AppArea, 'request_detail' | 'admin'>, string>> = {
  home: HOME_PATH,
  my_requests: MY_REQUESTS_PATH,
  repair: REPAIR_PATH,
  gm_create: GM_CREATE_PATH,
  gm_on_behalf: ON_BEHALF_PATH,
  board: BOARD_PATH,
  team: TEAM_PATH,
};

const NEW_REQUEST_FORMS: readonly (readonly [type: string, origin: string, area: 'repair' | 'gm_create' | 'gm_on_behalf'])[] = [
  ['maintenance', 'requester', 'repair'],
  ['gm_task', 'gm_initiated', 'gm_create'],
  ['maintenance', 'gm_on_behalf', 'gm_on_behalf'],
];

export function routeOf(pathname: string, search: string): AppRoute {
  switch (pathname) {
    case HOME_PATH:
      return { area: 'home' };
    case MY_REQUESTS_PATH:
      return { area: 'my_requests' };
    case BOARD_PATH:
      return { area: 'board' };
    case TEAM_PATH:
      return { area: 'team' };
    case '/requests/new': {
      const params = new URLSearchParams(search);
      const form = NEW_REQUEST_FORMS.find(([type, origin]) => params.get('type') === type && params.get('origin') === origin);
      return form === undefined ? { area: 'not_found' } : { area: form[2] };
    }
    default:
      break;
  }
  const detail = /^\/requests\/([^/]+)$/.exec(pathname);
  if (detail?.[1] !== undefined) return { area: 'request_detail', requestId: decodeURIComponent(detail[1]) };
  const admin = /^\/admin\/([^/]+)$/.exec(pathname);
  const section = ADMIN_SECTIONS.find((candidate) => candidate === admin?.[1]);
  if (section !== undefined) return { area: 'admin', section };
  return { area: 'not_found' };
}

/** Part 5 Patch F6: no bottom navigation for the whole repair form (also when a GM opens it for someone). */
export function hidesBottomNav(route: AppRoute): boolean {
  return route.area === 'repair' || route.area === 'gm_on_behalf';
}
