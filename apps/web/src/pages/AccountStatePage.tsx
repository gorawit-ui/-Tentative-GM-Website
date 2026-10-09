// A09 — a company account that cannot use the app (UI-01): switched off (“บัญชีถูกปิด”, D-S09-6), not set
// up yet, or its access could not be read. The reason, “เปลี่ยนบัญชี” and the contact box; no menu, no
// board, nothing of the app.
import { ContactBox } from '../components/ContactBox';
import { useSession, type SignedInUser } from '../session-context';

type Kind = 'disabled' | 'no_access' | 'error';

const HEADINGS: Readonly<Record<Kind, string>> = {
  disabled: 'บัญชีถูกปิด',
  no_access: 'บัญชีนี้ยังไม่ได้เปิดใช้งาน',
  error: 'ตรวจสอบบัญชีไม่สำเร็จ',
};

export function AccountStatePage({ kind, user }: { readonly kind: Kind; readonly user: SignedInUser }) {
  const { leave } = useSession();
  return (
    <main className="gm-login" id="main">
      <div className="gm-login-card gm-page" data-testid="login-card">
        <h1>{HEADINGS[kind]}</h1>
        {kind === 'disabled' && (
          <p>
            บัญชี <span className="gm-account-email">{user.email}</span> ถูกปิดการใช้งาน จึงเข้าใช้ระบบและดูข้อมูลไม่ได้ ถ้าคิดว่าไม่ถูกต้อง ติดต่อทีม GM
          </p>
        )}
        {kind === 'no_access' && (
          <p>
            ทีม GM ยังไม่ได้เพิ่ม <span className="gm-account-email">{user.email}</span> ในรายชื่อผู้ใช้ระบบ ติดต่อทีม GM เพื่อเปิดใช้งาน
          </p>
        )}
        {kind === 'error' && <p>อ่านสิทธิ์ของบัญชีไม่ได้ในตอนนี้ ตรวจการเชื่อมต่อแล้วลองใหม่อีกครั้ง</p>}
        <div className="gm-actions">
          {kind === 'error' && (
            <button type="button" className="gm-btn gm-btn--primary" onClick={() => window.location.reload()}>
              ลองใหม่
            </button>
          )}
          <button type="button" className="gm-btn gm-btn--secondary" onClick={() => void leave()}>
            {kind === 'error' ? 'ออกจากระบบ' : 'เปลี่ยนบัญชี'}
          </button>
        </div>
        <ContactBox />
      </div>
    </main>
  );
}
