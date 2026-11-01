// A13 — U1 “มีคนแจ้งเรื่องนี้แล้ว” (UI-03, between steps 3 and 4; prototype `duplicate` view and the
// “ติดตามเรื่องนี้” dialog): one card per open public repair that matches (number, title, status, assignee,
// extra reporters), “ใช่ เรื่องเดียวกัน — ติดตามเรื่องนี้” per card; the person's own report or one they
// already watch shows that instead, with a link. Watching asks for one optional note (photos: A15) and
// ends on “ติดตามงานนี้แล้ว” — no new request. Everything comes from the API (only public summary fields).
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ApiCallError, apiCall } from '../api-client';
import { Icon } from '../components/Icon';
import { HOME_PATH } from '../routes';

export interface DuplicateMatch {
  readonly request_id: string;
  readonly request_number: string;
  readonly summary_title: string;
  readonly status: 'queued' | 'in_progress' | 'waiting';
  readonly is_assigned: boolean;
  readonly assignee_label?: string;
  readonly location_label?: string;
  readonly area_label?: string;
  readonly watcher_count: number;
  readonly viewer: 'requester' | 'watcher' | 'none';
}

export interface DuplicateQuery {
  readonly locationId: string;
  /** undefined = “ไม่ระบุ”. */
  readonly areaId?: string | undefined;
  readonly symptomKey: string;
}

/** U1: the open repairs that match what was chosen (A14 asks the same API again when sending). */
export async function fetchDuplicates(query: DuplicateQuery): Promise<readonly DuplicateMatch[]> {
  const params = new URLSearchParams({ location_id: query.locationId, ...(query.areaId === undefined ? {} : { area_id: query.areaId }), symptom_key: query.symptomKey });
  return (await apiCall<{ matches: readonly DuplicateMatch[] }>('GET', `/api/repair/duplicates?${params.toString()}`)).matches;
}

/** Part 4 `status_labels`. */
const STATUS_LABELS: Readonly<Record<DuplicateMatch['status'], string>> = { queued: 'รอคิว', in_progress: 'กำลังทำ', waiting: 'รอผู้อื่น' };

export const requestPath = (requestId: string) => `/requests/${encodeURIComponent(requestId)}`;

/** U1: where it is, when the title (which a GM may have edited) does not already say so (prototype `card`). */
function placeLine(match: DuplicateMatch): string | undefined {
  if (match.location_label === undefined || match.summary_title.includes(match.location_label)) return undefined;
  return match.area_label === undefined ? match.location_label : `${match.location_label} · ${match.area_label}`;
}

function DuplicateCard({ match, onWatch }: { readonly match: DuplicateMatch; readonly onWatch: (match: DuplicateMatch) => void }) {
  const place = placeLine(match);
  return (
    <article className="gm-dup-card" data-testid="duplicate-card">
      <div className="gm-dup-card-top">
        <span className="gm-dup-number">{match.request_number}</span>
        <span className={`gm-status-badge gm-status-badge--${match.status}`}>{STATUS_LABELS[match.status]}</span>
      </div>
      <p className="gm-dup-title">{match.summary_title}</p>
      {place !== undefined && (
        <p className="gm-admin-muted" data-testid="duplicate-place">
          {place}
        </p>
      )}
      <p className="gm-admin-muted">{match.is_assigned && match.assignee_label !== undefined ? `ผู้รับผิดชอบ: ${match.assignee_label}` : 'ยังไม่มอบหมาย'}</p>
      {match.watcher_count > 0 && <p className="gm-dup-tag">{`มีผู้แจ้งเพิ่ม ${match.watcher_count} คน`}</p>}
      {match.viewer === 'requester' ? (
        <div className="gm-dup-self">
          <p className="font-semibold">คุณแจ้งเรื่องนี้ไว้แล้ว</p>
          <Link to={requestPath(match.request_id)} className="gm-btn gm-btn--secondary">
            ดูงานของคุณ
          </Link>
        </div>
      ) : match.viewer === 'watcher' ? (
        <div className="gm-dup-self">
          <p className="font-semibold">คุณติดตามเรื่องนี้อยู่แล้ว</p>
          <Link to={requestPath(match.request_id)} className="gm-btn gm-btn--secondary">
            ดูข้อมูลสรุป
          </Link>
        </div>
      ) : (
        <button type="button" className="gm-btn gm-btn--primary" onClick={() => onWatch(match)}>
          <Icon name="bell" />
          ใช่ เรื่องเดียวกัน — ติดตามเรื่องนี้
        </button>
      )}
    </article>
  );
}

export function DuplicateList({ matches, onWatch }: { readonly matches: readonly DuplicateMatch[]; readonly onWatch: (match: DuplicateMatch) => void }) {
  return (
    <div className="gm-dup-list" data-testid="repair-duplicates">
      <p>ใช่เรื่องเดียวกันไหม? ติดตามงานเดิมได้โดยไม่ต้องแจ้งซ้ำ</p>
      {matches.map((match) => (
        <DuplicateCard key={match.request_id} match={match} onWatch={onWatch} />
      ))}
    </div>
  );
}

export type WatchOutcome = 'added' | 'already_watching' | 'is_requester';
export type WatchFailure = 'not_open' | 'not_available';

/** The “ติดตามเรื่องนี้” dialog: one optional note, sent once with the watch. */
export function WatchDialog({
  match,
  onCancel,
  onWatched,
  onRefused,
}: {
  readonly match: DuplicateMatch;
  readonly onCancel: () => void;
  readonly onWatched: (outcome: WatchOutcome) => void;
  readonly onRefused: (why: WatchFailure) => void;
}) {
  const titleId = useId();
  const noteId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  // One command ID per dialog: pressing again after a lost reply is the same watch.
  const [commandId] = useState(() => crypto.randomUUID());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);
  const send = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const text = note.trim();
      const reply = await apiCall<{ result: { watch: WatchOutcome } }>('POST', '/api/commands', {
        command_id: commandId,
        type: 'watch_request',
        payload: { request_id: match.request_id, ...(text === '' ? {} : { note: text }) },
      });
      onWatched(reply.result.watch);
    } catch (caught) {
      setBusy(false);
      if (caught instanceof ApiCallError && caught.code === 'WATCH_NOT_OPEN') return onRefused('not_open');
      if (caught instanceof ApiCallError && caught.code === 'WATCH_NOT_AVAILABLE') return onRefused('not_available');
      setError(caught instanceof ApiCallError && caught.code === 'NOTE_TOO_LONG' ? 'หมายเหตุยาวเกิน 1,000 ตัวอักษร' : 'ติดตามไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองใหม่');
    }
  };
  return (
    <div className="gm-dialog-backdrop">
      <div className="gm-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId}>ติดตามเรื่องนี้</h2>
        <div className="gm-admin-stack">
          <p className="font-semibold">{`${match.request_number} · ${match.summary_title}`}</p>
          <p className="gm-admin-muted">ดูข้อมูลสรุปและรับแจ้งสถานะ โดยไม่ได้สิทธิ์รายละเอียดของผู้แจ้งคนแรก</p>
          <div className="gm-field">
            <label htmlFor={noteId}>หมายเหตุเพิ่มเติม (ส่งได้ครั้งเดียว ไม่บังคับ)</label>
            <textarea id={noteId} className="gm-input gm-dup-note" maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} />
          </div>
          <p className="gm-notice gm-notice--info">แนบรูปเพิ่มได้ในรุ่นถัดไป</p>
          {error !== undefined && (
            <p className="gm-notice gm-notice--danger" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="gm-admin-row-buttons gm-dialog-buttons">
          <button ref={cancelRef} type="button" className="gm-btn gm-btn--secondary" onClick={onCancel} disabled={busy}>
            ย้อนกลับ
          </button>
          <button type="button" className="gm-btn gm-btn--primary" onClick={() => void send()} disabled={busy}>
            <Icon name="bell" />
            ยืนยันติดตาม
          </button>
        </div>
      </div>
    </div>
  );
}

const DONE_HEADINGS: Readonly<Record<WatchOutcome, string>> = {
  added: 'ติดตามงานนี้แล้ว',
  already_watching: 'คุณติดตามเรื่องนี้อยู่แล้ว',
  is_requester: 'คุณแจ้งเรื่องนี้ไว้แล้ว',
};

export function Watched({ match, outcome }: { readonly match: DuplicateMatch; readonly outcome: WatchOutcome }) {
  return (
    <section className="gm-dup-done" data-testid="repair-watched" aria-labelledby="repair-watched-heading">
      <span className="gm-dup-done-mark" aria-hidden="true">
        <Icon name="check" />
      </span>
      <h2 id="repair-watched-heading" tabIndex={-1}>
        {DONE_HEADINGS[outcome]}
      </h2>
      <p className="gm-dup-number">{match.request_number}</p>
      <p className="gm-dup-title">{match.summary_title}</p>
      {outcome !== 'is_requester' && <p>คุณจะได้รับแจ้งเมื่อสถานะเปลี่ยนและเมื่อเสร็จ โดยไม่ต้องยืนยันปิดงาน</p>}
      <p className="gm-admin-muted">ไม่ได้สร้างงานใหม่ ทีม GM เห็นจำนวนผู้แจ้งเพิ่มของงานเดิม</p>
      <div className="gm-actions">
        <Link to={requestPath(match.request_id)} className="gm-btn gm-btn--primary">
          {outcome === 'is_requester' ? 'ดูงานของคุณ' : 'ดูข้อมูลสรุป'}
        </Link>
        <Link to={HOME_PATH} className="gm-btn gm-btn--secondary">
          กลับหน้าแรก
        </Link>
      </div>
    </section>
  );
}
