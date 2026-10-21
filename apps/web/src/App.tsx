// A09 — routes (Part 2 §3.1). /login is the only page without a session; every other address needs an
// active company account (otherwise: to /login?next=…, or the account's state page), then the area of
// the address must be one the role may open (canOpenArea) — a hidden menu is never the only guard, and
// the API and Rules check every read and command again.
import { Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router';
import { canOpenArea, type Role } from '@gm/domain';
import { AREA_LABELS } from './labels';
import { AccountStatePage } from './pages/AccountStatePage';
import { AdminPage, FormPage, ForbiddenPage, HomePage, NotFoundPage, PlaceholderPage } from './pages/AppPages';
import { LoginPage } from './pages/LoginPage';
import { routeOf, type AppRoute } from './routes';
import { safeReturnPath } from './session';
import { useSession } from './session-context';
import { AppShell } from './shell/AppShell';

/** The login page for a signed-out visit, keeping where the person was going (not for home). */
export function loginPathFor(path: string): string {
  return path === '/' ? '/login' : `/login?next=${encodeURIComponent(path)}`;
}

function LoginRoute() {
  const { state } = useSession();
  const [params] = useSearchParams();
  switch (state.kind) {
    case 'active':
      return <Navigate to={safeReturnPath(params.get('next'))} replace />;
    case 'disabled':
    case 'no_access':
    case 'error':
      return <AccountStatePage kind={state.kind} user={state.user} />;
    default:
      return <LoginPage busy={state.kind !== 'signed_out'} />;
  }
}

function Page({ route, role, name }: { readonly route: AppRoute; readonly role: Role; readonly name: string }) {
  if (route.area === 'not_found') return <NotFoundPage />;
  if (!canOpenArea({ role, enabled: true }, route.area)) return <ForbiddenPage role={role} />;
  switch (route.area) {
    case 'home':
      return <HomePage name={name} role={role} />;
    case 'my_requests':
      return <PlaceholderPage title="คำขอของฉัน" what="งานที่ฉันขอ และงานที่เกี่ยวข้องกับฉัน พร้อมจุด “มีอัปเดตใหม่”" />;
    case 'repair':
      return <FormPage title={AREA_LABELS.repair} what="แบบฟอร์มแจ้งซ่อม 4 ขั้น: สถานที่และบริเวณ อาการ รายละเอียดและรูป ตรวจและส่ง" />;
    case 'gm_create':
      return <FormPage title={AREA_LABELS.gm_create} what="ฟอร์มสร้างงาน GM หน้าเดียว และเปิดงานแทนผู้ขอ" />;
    case 'gm_on_behalf':
      return <FormPage title={AREA_LABELS.gm_on_behalf} what="ฟอร์มแจ้งซ่อมพร้อมเลือกผู้ขอจากรายชื่อหรือพิมพ์ชื่อ" />;
    case 'request_detail':
      return <PlaceholderPage title={AREA_LABELS.request_detail} what="สรุปหรือรายละเอียดงานตามสิทธิ์ของบัญชีนี้ ประวัติ และสิ่งที่ทำได้ตามบทบาท" />;
    case 'board':
      return <PlaceholderPage title="บอร์ดทีม GM" what="งานเปิดทั้งหมดใน 5 สถานะ และงานปิด/ยกเลิก 7 วันล่าสุด" />;
    case 'team':
      return <PlaceholderPage title="ติดต่อทีม GM" what="หน้าที่ของทีม GM ช่องทางติดต่อ FAQ และลิงก์บริการเดิม" />;
    case 'admin':
      return <AdminPage section={route.section} />;
  }
}

function SignedInApp() {
  const { state } = useSession();
  const location = useLocation();
  switch (state.kind) {
    case 'signed_out':
      return <Navigate to={loginPathFor(`${location.pathname}${location.search}`)} replace />;
    case 'starting':
    case 'checking':
      return <LoginPage busy />;
    case 'disabled':
    case 'no_access':
    case 'error':
      return <AccountStatePage kind={state.kind} user={state.user} />;
    case 'active': {
      const route = routeOf(location.pathname, location.search);
      return (
        <AppShell route={route} role={state.role} name={state.user.name} email={state.user.email}>
          <Page route={route} role={state.role} name={state.user.name} />
        </AppShell>
      );
    }
  }
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="*" element={<SignedInApp />} />
    </Routes>
  );
}

