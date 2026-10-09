// A09 — the areas of the web app and who may open them (Part 2 §2–3.1, Part 3 §0.2). Every active role
// gets the same five items; D-S04-6 (a Viewer opens their own requests) is newer than the “Viewer has
// four read items” line of Part 3 §0.2, so the Viewer keeps “แจ้งซ่อม”. GM Staff/Admin add “สร้างงาน GM /
// เปิดแทน”; only GM Admin has the Admin pages. The web hides what a role cannot open and refuses the
// URL as well; the API and Rules decide every read and command on their own (this is not the ACL).
import type { Role } from './request-creation';

export const APP_AREAS = ['home', 'my_requests', 'repair', 'board', 'team', 'request_detail', 'gm_create', 'gm_on_behalf', 'admin'] as const;
export type AppArea = (typeof APP_AREAS)[number];

/** Part 2 §3.1 “Admin ใน A”, in the order of the route table. */
export const ADMIN_SECTIONS = ['locations', 'qr', 'users', 'calendars', 'content'] as const;
export type AdminSection = (typeof ADMIN_SECTIONS)[number];

/** Who is looking, from access/{uid} (a verified company sign-in is checked before this). */
export interface NavigationViewer {
  readonly role: Role;
  readonly enabled: boolean;
}

export interface Navigation {
  /** Bottom navigation on mobile, sidebar on desktop, in this order (Part 3 §0.2). */
  readonly primary: readonly AppArea[];
  /** The separate GM entry (desktop top bar, mobile “เมนูเพิ่มเติม”). */
  readonly gm: readonly AppArea[];
  /** GM Admin only (desktop sidebar, mobile “เมนูเพิ่มเติม”). */
  readonly admin: readonly AdminSection[];
}

const PRIMARY: readonly AppArea[] = ['home', 'my_requests', 'repair', 'board', 'team'];
const EVERY_ROLE: ReadonlySet<AppArea> = new Set([...PRIMARY, 'request_detail']);
const GM_ONLY: ReadonlySet<AppArea> = new Set(['gm_create', 'gm_on_behalf']);
const NOTHING: Navigation = { primary: [], gm: [], admin: [] };

const isGmRole = (role: Role) => role === 'gm_staff' || role === 'gm_admin';

export function canOpenArea(viewer: NavigationViewer | undefined, area: AppArea): boolean {
  if (viewer === undefined || !viewer.enabled) return false;
  if (EVERY_ROLE.has(area)) return true;
  if (GM_ONLY.has(area)) return isGmRole(viewer.role);
  return area === 'admin' && viewer.role === 'gm_admin';
}

export function navigationFor(viewer: NavigationViewer | undefined): Navigation {
  if (viewer === undefined || !viewer.enabled) return NOTHING;
  return {
    primary: PRIMARY,
    gm: isGmRole(viewer.role) ? ['gm_create'] : [],
    admin: viewer.role === 'gm_admin' ? ADMIN_SECTIONS : [],
  };
}
