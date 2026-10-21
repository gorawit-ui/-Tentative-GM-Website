// A11 — UI-12 §13.1 สถานที่และบริเวณ: the five locations with their area counts and status → one
// location's areas: add, rename, close (never delete — old requests keep the place, D-S08-3) and open
// again. Mobile: cards with a button per row; desktop: tables. A failed save says why and keeps what
// was typed (§13 states). Every change is an Admin command; the API checks the role again.
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { AdminAreaView, AdminLocationView, AdminPlacesView } from '@gm/contracts';
import { Icon } from '../components/Icon';
import { adminPath, locationPath } from '../routes';
import { adminCommand, adminErrorText, getPlaces } from './api';
import { ActiveBadge, AdminHead, LoadFailed, Loading, SaveLine, useAdminData, useWide, type Saved } from './common';

const areaCount = (location: AdminLocationView) => `${location.area_count} บริเวณ · ใช้งาน ${location.active_area_count}`;

function SeedOffer({ onDone }: { readonly onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<Saved>({ kind: 'idle' });
  return (
    <div className="gm-admin-empty">
      <strong>ยังไม่มีสถานที่</strong>
      <p>เริ่มจาก 5 สถานที่ตาม brief (WH300 / FAC16 / FAC17 / Office 195 / Cafe 222) และ 6 บริเวณของ WH300 แล้วเพิ่มบริเวณของสถานที่อื่นก่อนใช้งานจริง</p>
      <div>
        <button
          type="button"
          className="gm-btn gm-btn--primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await adminCommand('seed_places', {});
              await onDone();
            } catch (error) {
              setSaved({ kind: 'error', text: adminErrorText(error) });
            } finally {
              setBusy(false);
            }
          }}
        >
          เพิ่ม 5 สถานที่ตาม brief
        </button>
      </div>
      <SaveLine saved={saved} />
    </div>
  );
}

function LocationList({ places }: { readonly places: AdminPlacesView }) {
  const wide = useWide();
  if (wide) {
    return (
      <div className="gm-admin-panel" data-testid="location-list">
        <table className="gm-admin-table" aria-label="สถานที่">
          <thead>
            <tr>
              <th scope="col">สถานที่</th>
              <th scope="col">บริเวณ</th>
              <th scope="col">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {places.locations.map((location) => (
              <tr key={location.id}>
                <td>
                  <Link className="gm-text-link text-brand-fg font-semibold" to={locationPath(location.id)}>
                    {location.label}
                  </Link>
                </td>
                <td>{areaCount(location)}</td>
                <td>
                  <ActiveBadge active={location.active} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <ul className="gm-admin-cards" data-testid="location-list">
      {places.locations.map((location) => (
        <li key={location.id} className="gm-admin-card">
          <div className="gm-admin-card-head">
            <Link className="gm-text-link text-brand-fg font-semibold" to={locationPath(location.id)}>
              {location.label}
            </Link>
            <ActiveBadge active={location.active} />
          </div>
          <p className="gm-admin-muted">{areaCount(location)}</p>
        </li>
      ))}
    </ul>
  );
}

export function LocationsPage() {
  const { state, reload } = useAdminData(getPlaces);
  return (
    <>
      <AdminHead title="สถานที่และบริเวณ">
        <p>เลือกสถานที่เพื่อเพิ่ม แก้ชื่อ หรือปิดใช้งานบริเวณ — บริเวณที่ปิดแล้วไม่ถูกลบ งานเก่ายังแสดงชื่อเดิม</p>
      </AdminHead>
      {state.kind === 'loading' && <Loading what="กำลังโหลดสถานที่…" />}
      {state.kind === 'failed' && <LoadFailed onRetry={() => void reload()} />}
      {state.kind === 'ready' && (state.data.locations.length === 0 ? <SeedOffer onDone={reload} /> : <LocationList places={state.data} />)}
    </>
  );
}

/** One area: its name, status, QR, and the buttons of the row (rename inline). */
function AreaActions({ area, run }: { readonly area: AdminAreaView; readonly run: (type: string, payload: Record<string, unknown>, done: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(area.label);
  const [busy, setBusy] = useState(false);
  const act = async (type: string, payload: Record<string, unknown>, done: string) => {
    setBusy(true);
    const ok = await run(type, payload, done);
    setBusy(false);
    return ok;
  };
  if (editing) {
    return (
      <form
        className="gm-admin-inline-form"
        onSubmit={async (event: FormEvent) => {
          event.preventDefault();
          if (await act('rename_area', { area_id: area.id, label }, 'บันทึกชื่อบริเวณแล้ว')) setEditing(false);
        }}
      >
        <label className="gm-field">
          <span>ชื่อบริเวณ</span>
          <input className="gm-input" value={label} maxLength={60} onChange={(event) => setLabel(event.target.value)} required />
        </label>
        <div className="gm-admin-row-buttons">
          <button type="submit" className="gm-btn gm-btn--primary" disabled={busy}>
            บันทึกชื่อ
          </button>
          <button
            type="button"
            className="gm-btn gm-btn--secondary"
            onClick={() => {
              setLabel(area.label);
              setEditing(false);
            }}
          >
            ยกเลิก
          </button>
        </div>
      </form>
    );
  }
  return (
    <div className="gm-admin-row-buttons">
      <button type="button" className="gm-btn gm-btn--secondary" onClick={() => setEditing(true)}>
        แก้ชื่อ
      </button>
      <button
        type="button"
        className="gm-btn gm-btn--secondary"
        disabled={busy}
        onClick={() => void act('set_area_active', { area_id: area.id, active: !area.active }, area.active ? 'ปิดใช้งานบริเวณแล้ว งานเดิมยังแสดงชื่อนี้' : 'เปิดใช้งานบริเวณแล้ว')}
      >
        {area.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
      </button>
    </div>
  );
}

const qrText = (area: AdminAreaView) => (area.qr_id === undefined ? 'ยังไม่มี QR' : 'มี QR');

function AreaList({ location, areas, run }: { readonly location: AdminLocationView; readonly areas: readonly AdminAreaView[]; readonly run: (type: string, payload: Record<string, unknown>, done: string) => Promise<boolean> }) {
  const wide = useWide();
  if (areas.length === 0) {
    return (
      <div className="gm-admin-empty" data-testid="area-list">
        <strong>ยังไม่มีบริเวณ</strong>
        <p>เพิ่มบริเวณด้านบนก่อนใช้งานจริง แล้วสร้าง QR ของแต่ละบริเวณได้ที่หน้า QR</p>
      </div>
    );
  }
  if (wide) {
    return (
      <div className="gm-admin-panel" data-testid="area-list">
        <table className="gm-admin-table" aria-label={`บริเวณของ ${location.label}`}>
          <thead>
            <tr>
              <th scope="col">บริเวณ</th>
              <th scope="col">สถานะ</th>
              <th scope="col">QR</th>
              <th scope="col">
                <span className="gm-sr-only">จัดการ</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {areas.map((area) => (
              <tr key={area.id}>
                <td className="font-semibold">{area.label}</td>
                <td>
                  <ActiveBadge active={area.active} />
                </td>
                <td>{qrText(area)}</td>
                <td>
                  <AreaActions key={`${area.id}-${area.label}-${area.active}`} area={area} run={run} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <ul className="gm-admin-cards" data-testid="area-list">
      {areas.map((area) => (
        <li key={area.id} className="gm-admin-card">
          <div className="gm-admin-card-head">
            <span className="font-semibold">{area.label}</span>
            <ActiveBadge active={area.active} />
          </div>
          <p className="gm-admin-muted">{qrText(area)}</p>
          <AreaActions key={`${area.id}-${area.label}-${area.active}`} area={area} run={run} />
        </li>
      ))}
    </ul>
  );
}

export function LocationDetailPage({ locationId }: { readonly locationId: string }) {
  const { state, reload } = useAdminData(getPlaces);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<Saved>({ kind: 'idle' });

  const run = async (type: string, payload: Record<string, unknown>, done: string): Promise<boolean> => {
    try {
      await adminCommand(type, payload);
      await reload();
      setSaved({ kind: 'done', text: done });
      return true;
    } catch (error) {
      setSaved({ kind: 'error', text: adminErrorText(error) });
      return false;
    }
  };

  if (state.kind === 'loading') return <Loading what="กำลังโหลดบริเวณ…" />;
  if (state.kind === 'failed') return <LoadFailed onRetry={() => void reload()} />;
  const location = state.data.locations.find((candidate) => candidate.id === locationId);
  const back = (
    <Link to={adminPath('locations')} className="gm-btn gm-btn--secondary">
      <Icon name="back" />
      สถานที่ทั้งหมด
    </Link>
  );
  if (location === undefined) {
    return (
      <>
        <AdminHead title="ไม่พบสถานที่นี้">
          <p>สถานที่อาจยังไม่ถูกเพิ่ม กลับไปเลือกจากรายการ</p>
        </AdminHead>
        {back}
      </>
    );
  }
  const areas = state.data.areas.filter((area) => area.location_id === location.id);
  return (
    <>
      <div className="gm-admin-back">{back}</div>
      <AdminHead title={location.label}>
        <p>
          {areaCount(location)} · <ActiveBadge active={location.active} />
        </p>
      </AdminHead>
      <section className="gm-admin-panel gm-admin-stack" aria-labelledby="add-area-heading">
        <h2 id="add-area-heading">เพิ่มบริเวณ</h2>
        <form
          className="gm-admin-add-form"
          onSubmit={async (event: FormEvent) => {
            event.preventDefault();
            setBusy(true);
            if (await run('add_area', { location_id: location.id, label }, 'เพิ่มบริเวณแล้ว')) setLabel('');
            setBusy(false);
          }}
        >
          <label className="gm-field">
            <span>ชื่อบริเวณใหม่</span>
            <input className="gm-input" value={label} maxLength={60} onChange={(event) => setLabel(event.target.value)} placeholder="เช่น ห้องประชุมชั้น 2" required />
          </label>
          <button type="submit" className="gm-btn gm-btn--primary" disabled={busy || !location.active}>
            เพิ่มบริเวณ
          </button>
        </form>
        {!location.active && <p className="gm-admin-muted">สถานที่นี้ปิดใช้งานอยู่ เปิดใช้งานก่อนเพิ่มบริเวณ</p>}
        <SaveLine saved={saved} />
      </section>
      <section className="gm-admin-stack" aria-labelledby="areas-heading">
        <h2 id="areas-heading">บริเวณ</h2>
        <AreaList location={location} areas={areas} run={run} />
      </section>
      <section className="gm-admin-panel gm-admin-stack" aria-labelledby="location-state-heading">
        <h2 id="location-state-heading">สถานะของสถานที่</h2>
        <p className="gm-admin-muted">ปิดใช้งานแล้วเลือกเป็นที่อยู่ใหม่หรือเพิ่มบริเวณไม่ได้ งานเดิมยังแสดงชื่อเดิม</p>
        <div>
          <button
            type="button"
            className="gm-btn gm-btn--secondary"
            onClick={() => void run('set_location_active', { location_id: location.id, active: !location.active }, location.active ? 'ปิดใช้งานสถานที่แล้ว' : 'เปิดใช้งานสถานที่แล้ว')}
          >
            {location.active ? 'ปิดใช้งานสถานที่' : 'เปิดใช้งานสถานที่'}
          </button>
        </div>
      </section>
    </>
  );
}
