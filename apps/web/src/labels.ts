// A09 — the Thai names of menus, pages and roles (Part 2 §2–3.1, Part 3 §0.2, prototype navItems).
import type { AdminSection, AppArea, Role } from '@gm/domain';

export const AREA_LABELS: Readonly<Record<AppArea, string>> = {
  home: 'หน้าแรก',
  my_requests: 'คำขอของฉัน',
  repair: 'แจ้งซ่อม',
  board: 'บอร์ดทีม',
  team: 'ติดต่อ GM',
  request_detail: 'รายละเอียดงาน',
  gm_create: 'สร้างงาน GM / เปิดแทน',
  gm_on_behalf: 'เปิดแทนผู้ขอ',
  admin: 'Admin',
};

/** Bottom navigation uses the short “บอร์ด” (Part 3 §0.2). */
export const MOBILE_AREA_LABELS: Readonly<Partial<Record<AppArea, string>>> = { board: 'บอร์ด' };

export const ADMIN_LABELS: Readonly<Record<AdminSection, string>> = {
  locations: 'สถานที่และบริเวณ',
  qr: 'QR ของบริเวณ',
  users: 'รายชื่อพนักงานและสิทธิ์',
  calendars: 'ปฏิทินบริษัท',
  content: 'เนื้อหาติดต่อทีม GM / FAQ',
};

export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  requester: 'พนักงาน',
  viewer: 'ผู้ดูภาพรวม',
  gm_staff: 'ทีม GM',
  gm_admin: 'GM Admin',
};
