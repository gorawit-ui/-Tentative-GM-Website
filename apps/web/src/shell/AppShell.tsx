// A09 — the route shell after login (Part 2 §2, Part 3 §0.1–0.2, Part 4 Patch P2, Part 5 Patch F6,
// prototype). Mobile (< 1024px): top bar with the brand and “เมนูเพิ่มเติม”, bottom navigation หน้าแรก /
// คำขอของฉัน / [แจ้งซ่อม] / บอร์ด / ติดต่อ GM, hidden during the repair form. Desktop: sidebar (232px,
// 72px from 1024 to 1365px) with the same items and, for GM Admin, the Admin pages; a top bar that
// always has “แจ้งซ่อม” and, for GM, “สร้างงาน GM / เปิดแทน”. Menus come from navigationFor; a page
// a role may not open is refused by the router as well (canOpenArea) — the API and Rules still decide
// every read.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { navigationFor, type AdminSection, type AppArea, type Role } from '@gm/domain';
import { Icon, type IconName } from '../components/Icon';
import { ADMIN_LABELS, AREA_LABELS, MOBILE_AREA_LABELS, ROLE_LABELS } from '../labels';
import { AREA_PATHS, adminPath, hidesBottomNav, type AppRoute } from '../routes';
import { useSession } from '../session-context';

type MenuArea = Exclude<AppArea, 'request_detail' | 'admin'>;

const AREA_ICONS: Readonly<Record<MenuArea, IconName>> = {
  home: 'home',
  my_requests: 'list',
  repair: 'repair',
  board: 'board',
  team: 'users',
  gm_create: 'plus',
  gm_on_behalf: 'plus',
};

const ADMIN_ICONS: Readonly<Record<AdminSection, IconName>> = {
  locations: 'location',
  qr: 'qr',
  users: 'users',
  calendars: 'calendar',
  content: 'file',
};

const isMenuArea = (area: AppArea): area is MenuArea => area !== 'request_detail' && area !== 'admin';

/** The menu entry that is “the current page” (a request detail counts as nothing). */
function isCurrent(route: AppRoute, area: MenuArea): boolean {
  return route.area === area;
}

function pageLabel(route: AppRoute): string {
  if (route.area === 'admin') return ADMIN_LABELS[route.section];
  if (route.area === 'not_found') return 'ไม่พบหน้านี้';
  return AREA_LABELS[route.area];
}

function AdminLinks({ sections, onPick }: { readonly sections: readonly AdminSection[]; readonly onPick?: () => void }) {
  return (
    <>
      {sections.map((section) => (
        <NavLink key={section} to={adminPath(section)} onClick={onPick}>
          <Icon name={ADMIN_ICONS[section]} />
          <span className="gm-nav-label">{ADMIN_LABELS[section]}</span>
        </NavLink>
      ))}
    </>
  );
}

interface ShellProps {
  readonly route: AppRoute;
  readonly role: Role;
  readonly name: string;
  readonly email: string;
  readonly children: ReactNode;
}

export function AppShell({ route, role, name, email, children }: ShellProps) {
  const { leave } = useSession();
  const location = useLocation();
  const navigation = navigationFor({ role, enabled: true });
  const primary = navigation.primary.filter(isMenuArea);
  const gm = navigation.gm.filter(isMenuArea);
  const showBottomNav = !hidesBottomNav(route);
  const menuRef = useRef<HTMLDialogElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const firstRender = useRef(true);

  // A new page: close the sheet, and give keyboard and screen-reader users the new heading.
  useEffect(() => {
    setMenuOpen(false);
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    document.querySelector<HTMLElement>('main h1')?.focus();
  }, [location.pathname, location.search]);

  useEffect(() => {
    const dialog = menuRef.current;
    if (dialog === null) return;
    if (menuOpen && !dialog.open) dialog.showModal();
    if (!menuOpen && dialog.open) dialog.close();
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);
  const logout = () => void leave();
  const roleLabel = ROLE_LABELS[role];

  return (
    <div className="gm-app" data-testid="app-shell">
      <a className="gm-skip-link" href="#main">
        ข้ามไปเนื้อหา
      </a>
      <aside className="gm-sidebar" data-testid="sidebar" aria-label="GM One Stop Service">
        <Link to={AREA_PATHS.home} className="gm-brand">
          <span className="gm-brand-symbol" aria-hidden="true">
            GM
          </span>
          <span className="gm-brand-copy">
            <span className="gm-brand-name">One Stop Service</span>
            <span className="gm-brand-sub">TDFB · MATCHAZUKI</span>
          </span>
        </Link>
        <nav className="gm-side-nav" aria-label="เมนูหลัก">
          {primary.map((area) => (
            <Link key={area} to={AREA_PATHS[area]} className={area === 'repair' ? 'gm-nav-repair' : undefined} aria-current={isCurrent(route, area) ? 'page' : undefined}>
              <Icon name={AREA_ICONS[area]} />
              <span className="gm-nav-label">{AREA_LABELS[area]}</span>
            </Link>
          ))}
        </nav>
        {navigation.admin.length > 0 && (
          <nav className="gm-side-nav" aria-labelledby="sidebar-admin-heading">
            <p className="gm-side-heading" id="sidebar-admin-heading">
              Admin
            </p>
            <AdminLinks sections={navigation.admin} />
          </nav>
        )}
        <div className="gm-sidebar-footer">
          <p className="gm-sidebar-text gm-sidebar-person">{name}</p>
          <p className="gm-sidebar-text">{roleLabel}</p>
          <button type="button" className="gm-btn gm-btn--secondary min-h-touch px-3 text-caption font-semibold" data-testid="compact-action" aria-label="ออกจากระบบ" onClick={logout}>
            <Icon name="logout" />
            <span className="gm-nav-label">ออกจากระบบ</span>
          </button>
        </div>
      </aside>

      <div className={showBottomNav ? 'gm-main-area gm-with-bottom-nav' : 'gm-main-area'}>
        <header className="gm-topbar">
          <Link to={AREA_PATHS.home} className="gm-brand gm-mobile-only">
            <span className="gm-brand-symbol" aria-hidden="true">
              GM
            </span>
            <span>
              <span className="gm-brand-name">GM Service</span>
              <span className="gm-brand-sub">One Stop Service</span>
            </span>
          </Link>
          <div className="gm-topbar-title">
            <p>{`ทีม GM / ${pageLabel(route)}`}</p>
            <p className="gm-topbar-page">{`${name} · ${roleLabel}`}</p>
          </div>
          <div className="gm-topbar-actions">
            {gm.map((area) => (
              <Link key={area} to={AREA_PATHS[area]} className="gm-btn gm-btn--secondary gm-desktop-only">
                <Icon name="plus" />
                {AREA_LABELS[area]}
              </Link>
            ))}
            <Link to={AREA_PATHS.repair} className="gm-btn gm-btn--primary gm-desktop-only">
              <Icon name="repair" />
              {AREA_LABELS.repair}
            </Link>
            <button
              type="button"
              className="gm-btn gm-btn--secondary gm-mobile-only min-h-touch px-3 text-caption font-semibold"
              data-testid="compact-action"
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <Icon name="menu" />
              เมนูเพิ่มเติม
            </button>
          </div>
        </header>

        <main className="gm-main" id="main">
          <div className="gm-page" data-testid="page" key={`${location.pathname}${location.search}`}>
            {children}
          </div>
        </main>
      </div>

      {showBottomNav && (
        <nav className="gm-bottom-nav" aria-label="เมนูหลักบนมือถือ">
          {primary.map((area) => (
            <Link key={area} to={AREA_PATHS[area]} className={area === 'repair' ? 'gm-nav-repair' : undefined} aria-current={isCurrent(route, area) ? 'page' : undefined}>
              <Icon name={AREA_ICONS[area]} />
              <span>{MOBILE_AREA_LABELS[area] ?? AREA_LABELS[area]}</span>
            </Link>
          ))}
        </nav>
      )}

      <dialog ref={menuRef} className="gm-sheet" aria-labelledby="more-menu-heading" onClose={closeMenu} onCancel={closeMenu}>
        {menuOpen && (
          <>
            <div className="gm-sheet-head">
              <h2 id="more-menu-heading">เมนูเพิ่มเติม</h2>
              <button type="button" className="gm-btn gm-btn--secondary min-h-touch px-3" onClick={closeMenu}>
                <Icon name="close" />
                ปิด
              </button>
            </div>
            <div className="gm-sheet-body">
              <div className="gm-sheet-account">
                <p className="font-semibold">{name}</p>
                <p>{`${email} · ${roleLabel}`}</p>
              </div>
              {gm.length > 0 && (
                <div className="gm-menu-list">
                  {gm.map((area) => (
                    <Link key={area} to={AREA_PATHS[area]} onClick={closeMenu}>
                      <Icon name="plus" />
                      {AREA_LABELS[area]}
                    </Link>
                  ))}
                </div>
              )}
              {navigation.admin.length > 0 && (
                <nav className="gm-menu-list" aria-labelledby="sheet-admin-heading">
                  <p className="gm-menu-heading" id="sheet-admin-heading">
                    Admin
                  </p>
                  <AdminLinks sections={navigation.admin} onPick={closeMenu} />
                </nav>
              )}
              <button type="button" className="gm-btn gm-btn--secondary w-full" onClick={logout}>
                <Icon name="logout" />
                ออกจากระบบ
              </button>
            </div>
          </>
        )}
      </dialog>
    </div>
  );
}
