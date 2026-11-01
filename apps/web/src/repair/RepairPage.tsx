// A12 — UI-03 แจ้งซ่อม, steps 1–3 (F01, U2, F6, FU-21, FU-43): สถานที่ → บริเวณ (with “ไม่ระบุ”) → อาการ
// (the brief's list with “อื่นๆ”), the place and area shown on every step, the automatic title (U2)
// previewed as soon as the symptom is chosen. A working QR fills the place and area and opens at the
// symptom step with “ไม่ใช่ที่นี่?”; a code that cannot be used says why and fills in nothing unusable.
// Everything comes from the API (the Admin's active places, D-A11-4); before login the person is sent to
// the login page with the code in the return address. Step 4 (details, photos, sending) is A14; the
// duplicate check before it (U1) is A13. Mobile: no bottom navigation, an action bar of 64 px (F6).
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { repairTitlePreview } from '@gm/domain';
import { ApiCallError, apiCall } from '../api-client';
import { ContactBox } from '../components/ContactBox';
import { Icon } from '../components/Icon';
import { HOME_PATH } from '../routes';

interface Place {
  readonly id: string;
  readonly label: string;
}
interface Area extends Place {
  readonly location_id: string;
}
interface RepairOptions {
  readonly locations: readonly Place[];
  readonly areas: readonly Area[];
  readonly symptoms: readonly { readonly key: string; readonly label: string }[];
}
type QrState =
  | { readonly state: 'ok'; readonly location_id: string; readonly area_id: string }
  | { readonly state: 'not_found' | 'qr_inactive' | 'location_inactive' }
  | { readonly state: 'area_inactive'; readonly location_id: string };

type Load =
  | { readonly kind: 'loading' }
  | { readonly kind: 'not_ready'; readonly code: string }
  | { readonly kind: 'failed' }
  | { readonly kind: 'ready'; readonly options: RepairOptions; readonly qr?: QrState | undefined };

type Step = 1 | 2 | 3 | 4;
const STEP_NAMES = ['สถานที่', 'บริเวณ', 'อาการ', 'รายละเอียด'] as const;
const STEP_TITLES = ['เลือกสถานที่', 'เลือกบริเวณ', 'อาการที่พบ', 'รายละเอียดและรูป'] as const;

/** F01: why a scanned code fills nothing in — said in words, with the way on. */
const QR_MESSAGES: Readonly<Record<Exclude<QrState['state'], 'ok'>, string>> = {
  not_found: 'ไม่พบ QR นี้ อาจพิมพ์ผิดหรือถูกยกเลิกแล้ว เลือกสถานที่เองได้',
  qr_inactive: 'QR นี้ถูกปิดใช้งานแล้ว เลือกสถานที่เองได้',
  location_inactive: 'สถานที่ของ QR นี้ปิดใช้งานแล้ว เลือกสถานที่เองได้',
  area_inactive: 'บริเวณของ QR นี้ปิดใช้งานแล้ว เลือกบริเวณใหม่ หรือเลือกสถานที่เองได้',
};

/** FU-21 / D-A01-2: what is missing, in words; the GM contacts follow. */
const NOT_READY: Readonly<Record<string, string>> = {
  PLACES_NOT_SET_UP: 'ผู้ดูแลยังไม่ได้ตั้งสถานที่',
  ROUTING_NOT_CONFIGURED: 'ผู้ดูแลยังไม่ได้ตั้งผู้รับเรื่อง',
  CALENDAR_NOT_CONFIGURED: 'ผู้ดูแลยังไม่ได้ตั้งปฏิทินวันทำงาน',
};

async function loadForm(qrId: string | undefined): Promise<Load> {
  try {
    const [options, qr] = await Promise.all([
      apiCall<RepairOptions>('GET', '/api/repair/options'),
      qrId === undefined ? Promise.resolve(undefined) : apiCall<QrState>('GET', `/api/repair/qr/${encodeURIComponent(qrId)}`),
    ]);
    return { kind: 'ready', options, qr };
  } catch (error) {
    if (error instanceof ApiCallError && error.status === 503) return { kind: 'not_ready', code: error.code };
    return { kind: 'failed' };
  }
}

interface Selection {
  readonly step: Step;
  readonly locationId?: string | undefined;
  /** `''` = “ไม่ระบุ”; undefined = not chosen yet. */
  readonly areaId?: string | undefined;
  readonly symptomKey?: string | undefined;
  /** The place and area came from a working QR code (until the person changes them). */
  readonly fromQr: boolean;
}

/** Where a scanned code starts the form: a working one at the symptom step; otherwise as far as it is still right. */
function startOf(options: RepairOptions, qr: QrState | undefined): Selection {
  const hasPlace = (id: string) => options.locations.some((location) => location.id === id);
  if (qr?.state === 'ok' && hasPlace(qr.location_id) && options.areas.some((area) => area.id === qr.area_id)) {
    return { step: 3, locationId: qr.location_id, areaId: qr.area_id, fromQr: true };
  }
  if (qr?.state === 'area_inactive' && hasPlace(qr.location_id)) return { step: 2, locationId: qr.location_id, fromQr: false };
  return { step: 1, fromQr: false };
}

function Choices({ items, chosen, onChoose }: { readonly items: readonly { readonly value: string; readonly label: string }[]; readonly chosen: string | undefined; readonly onChoose: (value: string) => void }) {
  return (
    <div className="gm-choice-grid" data-testid="repair-choices">
      {items.map((item) => (
        <button key={item.value} type="button" className="gm-choice" aria-pressed={chosen === item.value} onClick={() => onChoose(item.value)}>
          <span className="gm-choice-label">{item.label}</span>
          {chosen === item.value && <Icon name="check" />}
        </button>
      ))}
    </div>
  );
}

function Stepper({ step }: { readonly step: Step }) {
  return (
    <>
      <p className="gm-repair-step">{`ขั้น ${step} จาก 4`}</p>
      <ol className="gm-stepper" aria-label="ขั้นของฟอร์ม">
        {STEP_NAMES.map((name, index) => (
          <li key={name} className={index + 1 <= step ? 'gm-stepper-done' : undefined} aria-current={index + 1 === step ? 'step' : undefined}>
            {name}
          </li>
        ))}
      </ol>
    </>
  );
}

function ActionBar({ children }: { readonly children: ReactNode }) {
  return (
    <div className="gm-repair-bar" data-testid="repair-action-bar">
      {children}
    </div>
  );
}

function RepairForm({ options, qr }: { readonly options: RepairOptions; readonly qr: QrState | undefined }) {
  const [selection, setSelection] = useState<Selection>(() => startOf(options, qr));
  const [error, setError] = useState<string | undefined>(undefined);
  const [qrMessage, setQrMessage] = useState<string | undefined>(qr === undefined || qr.state === 'ok' ? undefined : QR_MESSAGES[qr.state]);
  const { step, locationId, areaId, symptomKey, fromQr } = selection;
  const location = options.locations.find((place) => place.id === locationId);
  const areas = options.areas.filter((area) => area.location_id === locationId);
  const area = areas.find((candidate) => candidate.id === areaId);
  const symptom = options.symptoms.find((candidate) => candidate.key === symptomKey);
  const title =
    location === undefined || symptom === undefined ? undefined : repairTitlePreview({ symptomLabel: symptom.label, areaLabel: area?.label, locationLabel: location.label });
  const placeText = location === undefined ? undefined : areaId === undefined ? location.label : `${location.label} · ${area?.label ?? 'ไม่ระบุบริเวณ'}`;

  const go = (next: Step) => {
    setError(undefined);
    setSelection((current) => ({ ...current, step: next }));
    window.scrollTo({ top: 0 });
  };
  const forward = () => {
    if (step === 1 && location === undefined) return setError('เลือกสถานที่ก่อน');
    if (step === 2 && areaId === undefined) return setError('เลือกบริเวณ หรือ “ไม่ระบุ” ก่อน');
    if (step === 3 && symptom === undefined) return setError('เลือกอาการก่อน');
    go((step + 1) as Step);
  };
  const changePlace = () => {
    setQrMessage(undefined);
    setSelection((current) => ({ ...current, step: 1, fromQr: false }));
    setError(undefined);
  };

  const content = (() => {
    switch (step) {
      case 1:
        return (
          <Choices
            items={options.locations.map((place) => ({ value: place.id, label: place.label }))}
            chosen={locationId}
            onChoose={(value) => {
              setError(undefined);
              // A new place: its area is chosen again (F01).
              setSelection((current) => (current.locationId === value ? current : { ...current, locationId: value, areaId: undefined, fromQr: false }));
            }}
          />
        );
      case 2:
        return (
          <>
            <Choices
              items={[...areas.map((place) => ({ value: place.id, label: place.label })), { value: '', label: 'ไม่ระบุ' }]}
              chosen={areaId}
              onChoose={(value) => {
                setError(undefined);
                setSelection((current) => ({ ...current, areaId: value, fromQr: false }));
              }}
            />
            <p className="gm-admin-muted">ไม่พบบริเวณ? เลือก “ไม่ระบุ” แล้วบอกจุดที่เกิดปัญหาในรายละเอียด</p>
          </>
        );
      case 3:
        return (
          <Choices
            items={options.symptoms.map((candidate) => ({ value: candidate.key, label: candidate.label }))}
            chosen={symptomKey}
            onChoose={(value) => {
              setError(undefined);
              setSelection((current) => ({ ...current, symptomKey: value }));
            }}
          />
        );
      case 4:
        return (
          <div className="gm-notice gm-notice--info">
            <p className="font-semibold">รายละเอียด รูป และการส่งเรื่องเปิดใช้ในรุ่นถัดไป</p>
            <p>ตอนนี้ยังส่งแจ้งซ่อมจากหน้านี้ไม่ได้ ถ้าเร่งด่วนติดต่อทีม GM โดยตรง</p>
          </div>
        );
    }
  })();

  return (
    <div className="gm-repair">
      <Stepper step={step} />
      {qrMessage !== undefined && (
        <p className="gm-notice gm-notice--warning" role="alert">
          {qrMessage}
        </p>
      )}
      {placeText !== undefined && step > 1 && (
        <div className={`gm-repair-context${fromQr ? ' gm-repair-context--qr' : ''}`} data-testid="repair-context">
          <div className="gm-repair-context-text">
            {fromQr && <span className="gm-admin-muted">เลือกจาก QR ให้แล้ว</span>}
            <span className="font-semibold">{placeText}</span>
          </div>
          <button type="button" className="gm-btn gm-btn--secondary" onClick={changePlace}>
            {fromQr ? 'ไม่ใช่ที่นี่? เปลี่ยนสถานที่/บริเวณ' : 'เปลี่ยนสถานที่/บริเวณ'}
          </button>
        </div>
      )}
      <section className="gm-repair-step-panel" aria-labelledby="repair-step-heading">
        <h2 id="repair-step-heading">{STEP_TITLES[step - 1]}</h2>
        {error !== undefined && (
          <p className="gm-notice gm-notice--danger" role="alert">
            {error}
          </p>
        )}
        {content}
      </section>
      {title !== undefined && step >= 3 && (
        <div className="gm-repair-title" data-testid="repair-title-preview">
          <span className="gm-admin-muted">ชื่อบนบอร์ด · สร้างให้อัตโนมัติ</span>
          <span className="font-semibold">{title}</span>
        </div>
      )}
      <ActionBar>
        {step === 1 ? (
          <Link to={HOME_PATH} className="gm-btn gm-btn--secondary">
            <Icon name="back" />
            ออกจากฟอร์ม
          </Link>
        ) : (
          <button type="button" className="gm-btn gm-btn--secondary" onClick={() => go((step - 1) as Step)}>
            <Icon name="back" />
            ย้อนกลับ
          </button>
        )}
        {step < 4 ? (
          <button type="button" className="gm-btn gm-btn--primary" onClick={forward}>
            ถัดไป
          </button>
        ) : (
          <Link to={HOME_PATH} className="gm-btn gm-btn--secondary">
            ออกจากฟอร์ม
          </Link>
        )}
      </ActionBar>
    </div>
  );
}

export function RepairPage({ qrId }: { readonly qrId?: string | undefined }) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const reload = useCallback(async () => {
    setLoad({ kind: 'loading' });
    setLoad(await loadForm(qrId));
  }, [qrId]);
  useEffect(() => {
    let active = true;
    void loadForm(qrId).then((result) => {
      if (active) setLoad(result);
    });
    return () => {
      active = false;
    };
  }, [qrId]);

  return (
    <>
      <div className="gm-page-head">
        <div>
          <h1 tabIndex={-1}>แจ้งซ่อม</h1>
        </div>
      </div>
      {load.kind === 'loading' && (
        <div className="gm-admin-loading" role="status" data-testid="repair-loading">
          <span className="gm-skeleton gm-admin-skeleton" aria-hidden="true" />
          <span>กำลังโหลดสถานที่และอาการ…</span>
        </div>
      )}
      {load.kind === 'failed' && (
        <div className="gm-notice gm-notice--warning" role="alert">
          <p>โหลดฟอร์มไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองใหม่</p>
          <div>
            <button type="button" className="gm-btn gm-btn--secondary" onClick={() => void reload()}>
              ลองใหม่
            </button>
          </div>
        </div>
      )}
      {load.kind === 'not_ready' && (
        <div className="gm-repair-not-ready" data-testid="repair-not-ready">
          <div className="gm-notice gm-notice--warning" role="alert">
            <p className="font-semibold">ระบบแจ้งซ่อมยังตั้งค่าไม่ครบ ยังส่งเรื่องจากหน้านี้ไม่ได้</p>
            <p>{`${NOT_READY[load.code] ?? 'การตั้งค่ายังไม่ครบ'} — ติดต่อทีม GM ตามช่องทางด้านล่างเพื่อแจ้งซ่อมแทน`}</p>
          </div>
          <ContactBox title="ติดต่อทีม GM" intro="แจ้งอาการ สถานที่ และบริเวณ ทีม GM จะเปิดเรื่องให้" />
          <div className="gm-actions">
            <Link to={HOME_PATH} className="gm-btn gm-btn--secondary">
              <Icon name="back" />
              ออกจากฟอร์ม
            </Link>
          </div>
        </div>
      )}
      {load.kind === 'ready' && <RepairForm key={qrId ?? 'form'} options={load.options} qr={load.qr} />}
    </>
  );
}
