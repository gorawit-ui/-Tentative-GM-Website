// A09 — UI-01 login. Mobile order: service name → short text → “เข้าสู่ระบบด้วย Google” → “ใช้บัญชี
// @tdfb.co” → the no-account contact box; desktop: the same in a box about 440px wide in the middle. The
// three errors are told apart (cancelled / failed / not a company account), each with a way on.
import { ContactBox } from '../components/ContactBox';
import { useSession, type LoginNotice } from '../session-context';

function Notice({ notice }: { readonly notice: LoginNotice }) {
  switch (notice.kind) {
    case 'outsider':
      return (
        <div className="gm-notice gm-notice--danger" role="alert">
          <p className="font-semibold">{`${notice.email} ไม่ใช่บัญชีบริษัท`}</p>
          <p>ระบบนี้ใช้บัญชี @tdfb.co เท่านั้น ระบบออกจากระบบให้แล้ว กด “เข้าสู่ระบบด้วย Google” แล้วเลือกบัญชีบริษัท</p>
        </div>
      );
    case 'cancelled':
      return (
        <div className="gm-notice gm-notice--info" role="alert">
          <p>ยกเลิกการเข้าสู่ระบบแล้ว กด “เข้าสู่ระบบด้วย Google” เพื่อลองอีกครั้ง</p>
        </div>
      );
    case 'failed':
      return (
        <div className="gm-notice gm-notice--warning" role="alert">
          <p>เข้าสู่ระบบไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองใหม่อีกครั้ง</p>
        </div>
      );
  }
}

export function LoginPage({ busy }: { readonly busy: boolean }) {
  const { notice, signInWithGoogle } = useSession();
  return (
    <main className="gm-login" id="main">
      <div className="gm-login-card gm-page" data-testid="login-card">
        <div className="gm-login-brand">
          <span className="gm-brand-symbol" aria-hidden="true">
            GM
          </span>
          <h1>GM One Stop Service</h1>
        </div>
        <p>แจ้งซ่อม ติดตามงาน และติดต่อทีม GM ในที่เดียว</p>
        {notice !== undefined && !busy && <Notice notice={notice} />}
        <button type="button" className="gm-btn gm-btn--primary w-full px-8" disabled={busy} onClick={() => void signInWithGoogle()}>
          เข้าสู่ระบบด้วย Google
        </button>
        <p className="gm-login-hint">ใช้บัญชี @tdfb.co</p>
        {busy && (
          <p role="status" className="gm-login-hint">
            กำลังตรวจบัญชี…
          </p>
        )}
        <ContactBox />
      </div>
    </main>
  );
}
