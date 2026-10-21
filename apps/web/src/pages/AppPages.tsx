// A09 — the pages inside the shell. Each later task fills its own page (home A23/A16, my requests A16,
// repair A12–A13, detail A17, board A18–A19, team A23, GM forms A21, Admin A10/A11/A23); until then a
// page says plainly that it is not open yet — no sample data, nothing fetched. Dates and times come
// from formatThaiDateTime only (FU-36, D-A07-2).
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { AdminSection, Role } from '@gm/domain';
import { formatThaiDateTime } from '@gm/time';
import { Icon, type IconName } from '../components/Icon';
import { ADMIN_LABELS, ROLE_LABELS } from '../labels';
import { HOME_PATH, MY_REQUESTS_PATH, REPAIR_PATH, TEAM_PATH } from '../routes';

function PageHead({ title, children }: { readonly title: string; readonly children?: ReactNode }) {
  return (
    <div className="gm-page-head">
      <div>
        <h1 tabIndex={-1}>{title}</h1>
        {children}
      </div>
    </div>
  );
}

function NotReady({ what }: { readonly what: string }) {
  return (
    <div className="gm-not-ready" role="status">
      <strong>ยังไม่เปิดใช้งานในรุ่นนี้</strong>
      <p>{what}</p>
    </div>
  );
}

const QUICK_LINKS: readonly { readonly to: string; readonly icon: IconName; readonly title: string; readonly text: string }[] = [
  { to: REPAIR_PATH, icon: 'repair', title: 'แจ้งซ่อม', text: 'เริ่มเรื่องได้ใน 4 ขั้น' },
  { to: MY_REQUESTS_PATH, icon: 'list', title: 'คำขอของฉัน', text: 'ดูความคืบหน้าและยืนยันงาน' },
  { to: TEAM_PATH, icon: 'users', title: 'ติดต่อทีม GM', text: 'หาเจ้าของเรื่องได้ตรงคน' },
];

export function HomePage({ name, role }: { readonly name: string; readonly role: Role }) {
  const now = Date.now();
  const gm = role === 'gm_staff' || role === 'gm_admin';
  return (
    <>
      <PageHead title={gm ? 'วันนี้ทีม GM กำลังทำอะไร' : 'วันนี้ให้ GM ช่วยเรื่องอะไร?'}>
        <p>
          {name} ·{' '}
          <time dateTime={new Date(now).toISOString()} data-testid="today">
            {formatThaiDateTime(now)}
          </time>
        </p>
      </PageHead>
      <nav className="gm-quick-grid" aria-label="ทางลัด">
        {QUICK_LINKS.map((item) => (
          <Link key={item.to} to={item.to} className="gm-quick-card">
            <span className="gm-quick-icon">
              <Icon name={item.icon} />
            </span>
            <span>
              <strong>{item.title}</strong>
              <span className="gm-quick-text">{item.text}</span>
            </span>
          </Link>
        ))}
      </nav>
      <NotReady what="ทีม GM ตอนนี้ งานที่รอคุณยืนยัน และบอร์ดย่อ จะแสดงที่นี่" />
    </>
  );
}

export function PlaceholderPage({ title, what, children }: { readonly title: string; readonly what: string; readonly children?: ReactNode }) {
  return (
    <>
      <PageHead title={title} />
      {children}
      <NotReady what={what} />
    </>
  );
}

/** Part 5 Patch F6: the repair form hides the bottom navigation, so it has its own way out. */
export function FormPage({ title, what }: { readonly title: string; readonly what: string }) {
  return (
    <>
      <PageHead title={title} />
      <NotReady what={what} />
      <div className="gm-actions">
        <Link to={HOME_PATH} className="gm-btn gm-btn--secondary">
          <Icon name="back" />
          ออกจากฟอร์ม
        </Link>
      </div>
    </>
  );
}

export const ADMIN_PAGE_TEXT: Readonly<Record<AdminSection, string>> = {
  locations: 'สถานที่ 5 แห่งและบริเวณย่อย การเปิด/ปิดใช้งาน',
  qr: 'เลือกสถานที่/บริเวณแล้วสร้าง QR ที่ผูกกับบริเวณนั้น',
  users: 'รายชื่อพนักงาน role และสถานะการจับคู่ Slack',
  calendars: 'ปฏิทินบริษัท จันทร์–ศุกร์ และวันหยุด',
  content: 'เนื้อหาติดต่อทีม GM / FAQ และช่องทางติดต่อก่อนเข้าสู่ระบบ',
};

export function AdminPage({ section }: { readonly section: AdminSection }) {
  return <PlaceholderPage title={ADMIN_LABELS[section]} what={ADMIN_PAGE_TEXT[section]} />;
}

export function ForbiddenPage({ role }: { readonly role: Role }) {
  return (
    <>
      <PageHead title="ไม่มีสิทธิ์เข้าหน้านี้">
        <p>{`บัญชีนี้ (${ROLE_LABELS[role]}) เปิดหน้านี้ไม่ได้ ถ้าจำเป็นต้องใช้ ติดต่อ GM Admin`}</p>
      </PageHead>
      <Link to={HOME_PATH} className="gm-btn gm-btn--secondary">
        กลับหน้าแรก
      </Link>
    </>
  );
}

export function NotFoundPage() {
  return (
    <>
      <PageHead title="ไม่พบหน้านี้">
        <p>ลิงก์อาจพิมพ์ผิดหรือหน้านี้ไม่มีแล้ว</p>
      </PageHead>
      <Link to={HOME_PATH} className="gm-btn gm-btn--secondary">
        กลับหน้าแรก
      </Link>
    </>
  );
}
