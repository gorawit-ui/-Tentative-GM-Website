// A11 — UI-12 §13.2 QR ของบริเวณ: choose a place and an area → a preview with the readable name, the
// link to test, print/download; turn the code off/on; move it to another area (same code, nothing to
// reprint). The code is only `{base}/q/{qr_id}` (Part 6 §6.2), drawn in the page (no QR service). The
// print page is a watermarked sample until the base URL is the production domain: a code printed with
// a temporary domain stops working when the app moves to the real one. A preview creates no request.
import { useId, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { AdminAreaView, AdminPlacesView, AdminQrView } from '@gm/contracts';
import { PROD_PUBLIC_BASE_URL, qrPrintMode, qrTargetUrl } from '@gm/domain';
import { Icon } from '../components/Icon';
import { webConfig } from '../firebase';
import { qrMatrix, qrSvgDocument, qrSvgPath, QR_QUIET_ZONE } from '../qr';
import { adminPath, qrPrintPath } from '../routes';
import { adminCommand, adminErrorText, getPlaces } from './api';
import { ActiveBadge, AdminHead, LoadFailed, Loading, SaveLine, useAdminData, type Saved } from './common';

export const SAMPLE_WATERMARK = 'ตัวอย่าง ห้ามพิมพ์ติดจริง';

/** The origin printed in the codes: the configured one, or (local runs) this page's own. */
export function qrBaseUrl(): string {
  return webConfig.publicBaseUrl ?? window.location.origin;
}

export function QrImage({ link, name, className }: { readonly link: string; readonly name: string; readonly className?: string }) {
  const matrix = useMemo(() => qrMatrix(link), [link]);
  const size = matrix.length + 2 * QR_QUIET_ZONE;
  return (
    <svg className={className ?? 'gm-qr-image'} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`QR ของ ${name}`} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={qrSvgPath(matrix)} fill="#000" />
    </svg>
  );
}

const placeName = (places: AdminPlacesView, area: AdminAreaView) => `${places.locations.find((location) => location.id === area.location_id)?.label ?? ''} · ${area.label}`;

function MoveQr({ places, qr, onMove }: { readonly places: AdminPlacesView; readonly qr: AdminQrView; readonly onMove: (areaId: string) => Promise<void> }) {
  const [target, setTarget] = useState('');
  const id = useId();
  const free = places.areas.filter((area) => area.active && area.qr_id === undefined);
  if (free.length === 0) return <p className="gm-admin-muted">ไม่มีบริเวณที่ยังไม่มี QR ให้ย้ายไป</p>;
  return (
    <form
      className="gm-admin-add-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (target !== '') void onMove(target);
      }}
    >
      <div className="gm-field">
        <label htmlFor={id}>ย้าย QR นี้ไปบริเวณ</label>
        <select id={id} className="gm-input" value={target} onChange={(event) => setTarget(event.target.value)} required>
          <option value="">เลือกบริเวณที่ยังไม่มี QR</option>
          {places.locations.map((location) => {
            const options = free.filter((area) => area.location_id === location.id && area.id !== qr.area_id);
            return options.length === 0 ? null : (
              <optgroup key={location.id} label={location.label}>
                {options.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.label}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </div>
      <button type="submit" className="gm-btn gm-btn--secondary" disabled={target === ''}>
        ย้าย QR
      </button>
    </form>
  );
}

function Preview({ places, area, run }: { readonly places: AdminPlacesView; readonly area: AdminAreaView; readonly run: (type: string, payload: Record<string, unknown>, done: string, then?: (result: Readonly<Record<string, unknown>>) => void) => Promise<void> }) {
  const name = placeName(places, area);
  const qr = area.qr_id === undefined ? undefined : places.qr_codes.find((code) => code.id === area.qr_id);
  return (
    <section className="gm-admin-panel gm-admin-stack" data-testid="qr-preview" aria-labelledby="qr-preview-heading">
      <h2 id="qr-preview-heading">{name}</h2>
      <p className="gm-admin-muted">หน้านี้ไม่สร้างงานแจ้งซ่อม — สแกนหรือเปิดลิงก์ทดสอบได้ งานเกิดเมื่อผู้ใช้ส่งแบบฟอร์มจริงเท่านั้น</p>
      {!area.active && (
        <p className="gm-notice gm-notice--warning" role="status">
          บริเวณนี้ถูกปิดใช้งาน เลือกบริเวณอื่น หรือเปิดใช้งานบริเวณที่หน้าสถานที่และบริเวณ
        </p>
      )}
      {qr === undefined ? (
        <div className="gm-admin-stack">
          <p>บริเวณนี้ยังไม่มี QR</p>
          {area.active && (
            <div>
              <button type="button" className="gm-btn gm-btn--primary" onClick={() => void run('create_qr', { area_id: area.id }, 'สร้าง QR แล้ว')}>
                สร้าง QR ของบริเวณนี้
              </button>
            </div>
          )}
        </div>
      ) : (
        <QrDetail places={places} qr={qr} name={name} run={run} />
      )}
    </section>
  );
}

function QrDetail({ places, qr, name, run }: { readonly places: AdminPlacesView; readonly qr: AdminQrView; readonly name: string; readonly run: (type: string, payload: Record<string, unknown>, done: string, then?: (result: Readonly<Record<string, unknown>>) => void) => Promise<void> }) {
  const link = qrTargetUrl(qrBaseUrl(), qr.id);
  return (
    <div className="gm-qr-detail">
      <QrImage link={link} name={name} />
      <div className="gm-admin-stack">
        <div className="gm-admin-card-head">
          <span>สถานะ QR</span>
          <ActiveBadge active={qr.active} />
        </div>
        {!qr.active && <p className="gm-admin-muted">QR นี้ปิดใช้งานแล้ว ผู้ที่สแกนจะได้เลือกสถานที่และบริเวณเอง</p>}
        <p className="gm-qr-url" data-testid="qr-link">
          {link}
        </p>
        <div className="gm-admin-row-buttons">
          <a className="gm-btn gm-btn--secondary" href={link} target="_blank" rel="noopener noreferrer">
            เปิดลิงก์ทดสอบ
          </a>
          <Link className="gm-btn gm-btn--secondary" to={qrPrintPath(qr.id)}>
            พิมพ์ / ดาวน์โหลด
          </Link>
          <button type="button" className="gm-btn gm-btn--secondary" onClick={() => void run('set_qr_active', { qr_id: qr.id, active: !qr.active }, qr.active ? 'ปิดใช้งาน QR แล้ว' : 'เปิดใช้งาน QR แล้ว')}>
            {qr.active ? 'ปิดใช้งาน QR' : 'เปิดใช้งาน QR'}
          </button>
        </div>
        <MoveQr places={places} qr={qr} onMove={(areaId) => run('move_qr', { qr_id: qr.id, area_id: areaId }, 'ย้าย QR แล้ว ลิงก์และรูปเดิมใช้ต่อได้ ไม่ต้องพิมพ์ใหม่')} />
      </div>
    </div>
  );
}

export function QrPage() {
  const { state, reload } = useAdminData(getPlaces);
  const [params, setParams] = useSearchParams();
  const [saved, setSaved] = useState<Saved>({ kind: 'idle' });
  const areaId = params.get('area') ?? '';
  const [locationChoice, setLocationChoice] = useState(params.get('location') ?? '');
  const locationSelect = useId();
  const areaSelect = useId();

  if (state.kind === 'loading') return <Loading what="กำลังโหลดสถานที่และ QR…" />;
  if (state.kind === 'failed') return <LoadFailed onRetry={() => void reload()} />;
  const places = state.data;
  const area = places.areas.find((candidate) => candidate.id === areaId);
  const locationId = area?.location_id ?? locationChoice;
  const choose = (next: { location?: string; area?: string }) => {
    const search = new URLSearchParams();
    if (next.location) search.set('location', next.location);
    if (next.area) search.set('area', next.area);
    setParams(search, { replace: true });
  };
  const run = async (type: string, payload: Record<string, unknown>, done: string, then?: (result: Readonly<Record<string, unknown>>) => void) => {
    try {
      const reply = await adminCommand(type, payload);
      await reload();
      if (type === 'move_qr' && typeof payload.area_id === 'string') {
        const moved = places.areas.find((candidate) => candidate.id === payload.area_id);
        choose({ location: moved?.location_id ?? locationId, area: payload.area_id });
      }
      then?.(reply.result);
      setSaved({ kind: 'done', text: done });
    } catch (error) {
      setSaved({ kind: 'error', text: adminErrorText(error) });
    }
  };
  return (
    <>
      <AdminHead title="QR ของบริเวณ">
        <p>1 บริเวณมี QR 1 รหัส ลิงก์มีแต่รหัสสุ่ม ย้ายไปบริเวณอื่นได้โดยไม่ต้องพิมพ์ใหม่</p>
      </AdminHead>
      <div className="gm-admin-panel gm-admin-choose">
        <div className="gm-field">
          <label htmlFor={locationSelect}>สถานที่</label>
          <select
            id={locationSelect}
            className="gm-input"
            value={locationId}
            onChange={(event) => {
              setLocationChoice(event.target.value);
              setSaved({ kind: 'idle' });
              choose({ location: event.target.value });
            }}
          >
            <option value="">เลือกสถานที่</option>
            {places.locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.label}
              </option>
            ))}
          </select>
        </div>
        <div className="gm-field">
          <label htmlFor={areaSelect}>บริเวณ</label>
          <select
            id={areaSelect}
            className="gm-input"
            value={area?.id ?? ''}
            disabled={locationId === ''}
            onChange={(event) => {
              setSaved({ kind: 'idle' });
              choose({ location: locationId, area: event.target.value });
            }}
          >
            <option value="">เลือกบริเวณ</option>
            {places.areas
              .filter((candidate) => candidate.location_id === locationId)
              .map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.active ? candidate.label : `${candidate.label} (ปิดใช้งาน)`}
                </option>
              ))}
          </select>
        </div>
      </div>
      <SaveLine saved={saved} />
      {area === undefined ? (
        <div className="gm-admin-empty">
          <strong>ยังไม่เลือกบริเวณ</strong>
          <p>เลือกสถานที่และบริเวณเพื่อดู QR สร้าง QR หรือพิมพ์</p>
        </div>
      ) : (
        <Preview places={places} area={area} run={run} />
      )}
    </>
  );
}

function download(svg: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function QrPrintPage({ qrId }: { readonly qrId: string }) {
  const { state, reload } = useAdminData(getPlaces);
  if (state.kind === 'loading') return <Loading what="กำลังโหลด QR…" />;
  if (state.kind === 'failed') return <LoadFailed onRetry={() => void reload()} />;
  const places = state.data;
  const qr = places.qr_codes.find((code) => code.id === qrId);
  const area = qr === undefined ? undefined : places.areas.find((candidate) => candidate.id === qr.area_id);
  const back = (
    <Link to={adminPath('qr')} className="gm-btn gm-btn--secondary">
      <Icon name="back" />
      กลับไปหน้า QR
    </Link>
  );
  if (qr === undefined || area === undefined) {
    return (
      <>
        <AdminHead title="ไม่พบ QR นี้">
          <p>QR อาจถูกย้ายหรือยังไม่ถูกสร้าง เลือกใหม่จากหน้า QR</p>
        </AdminHead>
        {back}
      </>
    );
  }
  const base = qrBaseUrl();
  const link = qrTargetUrl(base, qr.id);
  const name = placeName(places, area);
  const sample = qrPrintMode(webConfig.publicBaseUrl) === 'sample';
  return (
    <>
      <div className="gm-admin-back gm-print-hide">{back}</div>
      <AdminHead title="พิมพ์ QR">
        <p className="gm-print-hide">พิมพ์หรือดาวน์โหลดไฟล์ SVG ไปติดที่บริเวณนี้</p>
      </AdminHead>
      {sample && (
        <div className="gm-notice gm-notice--warning gm-print-hide" role="note">
          <p className="font-semibold">ยังไม่ได้ตั้งโดเมนจริง ({PROD_PUBLIC_BASE_URL})</p>
          <p>QR ที่พิมพ์ด้วยโดเมนชั่วคราว ({base}) จะใช้ไม่ได้เมื่อย้ายไปโดเมนจริง ตอนนี้จึงพิมพ์ได้เป็นตัวอย่างเท่านั้น</p>
        </div>
      )}
      {!qr.active && (
        <p className="gm-notice gm-notice--warning gm-print-hide" role="note">
          QR นี้ปิดใช้งานอยู่ ผู้ที่สแกนจะได้เลือกสถานที่เอง
        </p>
      )}
      <div className="gm-qr-sheet" data-testid="qr-print-sheet">
        {sample && (
          <p className="gm-qr-watermark">{SAMPLE_WATERMARK}</p>
        )}
        <p className="gm-qr-sheet-title">แจ้งซ่อมบริเวณนี้</p>
        <QrImage link={link} name={name} className="gm-qr-image gm-qr-image--print" />
        <p className="gm-qr-sheet-place">{name}</p>
        <p className="gm-qr-url">{link}</p>
      </div>
      <div className="gm-admin-row-buttons gm-print-hide">
        <button type="button" className="gm-btn gm-btn--primary" onClick={() => window.print()}>
          พิมพ์
        </button>
        <button type="button" className="gm-btn gm-btn--secondary" onClick={() => download(qrSvgDocument(link, `QR ของ ${name}`, sample ? SAMPLE_WATERMARK : undefined), `qr-${qr.id}${sample ? '-sample' : ''}.svg`)}>
          ดาวน์โหลด SVG
        </button>
      </div>
    </>
  );
}
