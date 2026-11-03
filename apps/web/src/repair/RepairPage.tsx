// A12 — UI-03 แจ้งซ่อม, steps 1–3 (F01, U2, F6, FU-21, FU-43): สถานที่ → บริเวณ (with “ไม่ระบุ”) → อาการ
// (the brief's list with “อื่นๆ”), the place and area shown on every step, the automatic title (U2)
// previewed as soon as the symptom is chosen. A working QR fills the place and area and opens at the
// symptom step with “ไม่ใช่ที่นี่?”; a code that cannot be used says why and fills in nothing unusable.
// Everything comes from the API (the Admin's active places, D-A11-4); before login the person is sent to
// the login page with the code in the return address. A13: after the symptom (not “อื่นๆ”) the form asks
// for open repairs that match (U1); a match shows “มีคนแจ้งเรื่องนี้แล้ว” first, a failed check says so.
// A14: step 4 — the automatic title read-only (U2), the description (“อื่นๆ” must be described); photos
// come with A15 and are not shown yet. Sending uses one command_id per filled form, reused on every retry,
// and the button is locked while sending; the API checks duplicates again (FU-49) and a match brings the
// interstitial back with nothing typed lost (“แจ้งเรื่องใหม่” then sends without asking again). Success
// gives the number, says the GM team was told and links to the request; “not set up” (503) shows the GM
// contacts (FU-21); other errors say what to do. The draft stays in this tab's session (FU-47).
// Mobile: no bottom navigation, an action bar of 64 px (F6).
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { OTHER_SYMPTOM_KEY, repairTitlePreview } from '@gm/domain';
import { ApiCallError, apiCall } from '../api-client';
import { ContactBox } from '../components/ContactBox';
import { Icon } from '../components/Icon';
import { HOME_PATH, MY_REQUESTS_PATH } from '../routes';
import { useSession } from '../session-context';
import { DuplicateList, WatchDialog, Watched, fetchDuplicates, requestPath, watchable, type DuplicateMatch, type WatchFailure, type WatchOutcome } from './DuplicateCheck';
import { clearRepairDraft, loadRepairDraft, saveRepairDraft, type RepairDraft } from './repair-draft';

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
const STEP_TITLES = ['เลือกสถานที่', 'เลือกบริเวณ', 'อาการที่พบ', 'รายละเอียด'] as const;

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

/** U1: the duplicate check between steps 3 and 4. */
type DuplicateState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'checking' }
  | { readonly kind: 'matches'; readonly matches: readonly DuplicateMatch[]; readonly origin: 'check' | 'send' }
  | { readonly kind: 'failed' };

/** A14: where the send stands. */
type Sending =
  | { readonly kind: 'idle' }
  | { readonly kind: 'sending' }
  /** No answer came back: the request may or may not exist; the same command_id makes a resend safe. */
  | { readonly kind: 'unknown' }
  | { readonly kind: 'place_gone' }
  | { readonly kind: 'not_ready'; readonly code: string }
  | { readonly kind: 'already_sent' }
  | { readonly kind: 'failed'; readonly message: string };

interface Sent {
  readonly requestId: string;
  readonly number: string;
  readonly isAssigned: boolean;
  readonly assigneeLabel?: string | undefined;
}

interface CreateReply {
  readonly result: { readonly request_id: string; readonly request_number: string; readonly is_assigned?: boolean; readonly assignee_label?: string };
}

/** The draft this tab kept for this person, if its place and symptom are still offered (FU-47). */
function draftFor(options: RepairOptions, personId: string, qr: QrState | undefined): RepairDraft | undefined {
  // A scanned code is a new report from that spot: it wins over a draft.
  if (qr !== undefined) return undefined;
  const draft = loadRepairDraft(window.sessionStorage, personId);
  if (draft === undefined) return undefined;
  const placeOk = draft.locationId === undefined || options.locations.some((place) => place.id === draft.locationId);
  const areaOk = draft.areaId === undefined || draft.areaId === '' || options.areas.some((area) => area.id === draft.areaId && area.location_id === draft.locationId);
  const symptomOk = draft.symptomKey === undefined || options.symptoms.some((symptom) => symptom.key === draft.symptomKey);
  return placeOk && areaOk && symptomOk ? draft : undefined;
}

const PLACE_GONE = new Set(['LOCATION_UNAVAILABLE', 'AREA_UNAVAILABLE', 'SYMPTOM_UNKNOWN']);
const MAX_SENT_DISMISSED = 20;

const WATCH_REFUSED: Readonly<Record<WatchFailure, string>> = {
  not_open: 'งานนี้ปิดหรือเสร็จไปแล้ว ติดตามไม่ได้',
  not_available: 'งานนี้ติดตามไม่ได้แล้ว',
};

/** A14: what happened to the last send, in Thai, with what to do next (UI-03 Error state). */
function SendState({ sending, onChoosePlace }: { readonly sending: Sending; readonly onChoosePlace: () => void }) {
  switch (sending.kind) {
    case 'idle':
    case 'sending':
      return null;
    case 'unknown':
      return (
        <p className="gm-notice gm-notice--warning" role="alert">
          ยังไม่แน่ใจว่าส่งถึงหรือไม่ (การเชื่อมต่อขาด) กด “ส่งอีกครั้ง” ได้เลย ระบบจะไม่สร้างงานซ้ำ
        </p>
      );
    case 'place_gone':
      return (
        <div className="gm-notice gm-notice--warning gm-dup-failed">
          <p role="alert">สถานที่ บริเวณ หรืออาการนี้ใช้ไม่ได้แล้ว (ผู้ดูแลเพิ่งปิด) เลือกใหม่แล้วส่งอีกครั้ง ข้อความที่กรอกยังอยู่</p>
          <div>
            <button type="button" className="gm-btn gm-btn--secondary" onClick={onChoosePlace}>
              เลือกสถานที่ใหม่
            </button>
          </div>
        </div>
      );
    case 'not_ready':
      return (
        <div className="gm-repair-not-ready" data-testid="repair-send-not-ready">
          <div className="gm-notice gm-notice--warning" role="alert">
            <p className="font-semibold">ระบบแจ้งซ่อมยังตั้งค่าไม่ครบ ยังส่งเรื่องจากหน้านี้ไม่ได้</p>
            <p>{`${NOT_READY[sending.code] ?? 'การตั้งค่ายังไม่ครบ'} — ข้อมูลที่กรอกยังอยู่ ติดต่อทีม GM ตามช่องทางด้านล่างเพื่อแจ้งซ่อมแทน`}</p>
          </div>
          <ContactBox title="ติดต่อทีม GM" intro="แจ้งอาการ สถานที่ และบริเวณ ทีม GM จะเปิดเรื่องให้" />
        </div>
      );
    case 'already_sent':
      return (
        <p className="gm-notice gm-notice--info" role="alert">
          เรื่องนี้ส่งไปแล้วจากการกดครั้งก่อน (ใช้ข้อความตอนนั้น) ดูได้ในคำขอของฉัน
        </p>
      );
    case 'failed':
      return (
        <p className="gm-notice gm-notice--danger" role="alert">
          {sending.message}
        </p>
      );
  }
}

function RepairForm({ options, qr, personId }: { readonly options: RepairOptions; readonly qr: QrState | undefined; readonly personId: string }) {
  const [restored] = useState(() => draftFor(options, personId, qr));
  const [selection, setSelection] = useState<Selection>(() =>
    restored === undefined
      ? startOf(options, qr)
      : { step: restored.step, locationId: restored.locationId, areaId: restored.areaId, symptomKey: restored.symptomKey, fromQr: false },
  );
  const [description, setDescription] = useState(restored?.description ?? '');
  // A14: one command_id per filled form, reused on every resend (one request whatever happens).
  const [commandId] = useState(() => restored?.commandId ?? crypto.randomUUID());
  const [sending, setSending] = useState<Sending>({ kind: 'idle' });
  const [sent, setSent] = useState<Sent | undefined>(undefined);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const detailsRef = useRef<HTMLTextAreaElement>(null);
  const detailsId = useId();
  const [error, setError] = useState<string | undefined>(undefined);
  const [duplicates, setDuplicates] = useState<DuplicateState>({ kind: 'idle' });
  // “ไม่ใช่ แจ้งเรื่องใหม่”: not asked again about the same requests (U1).
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set(restored?.dismissed ?? []));
  const [watching, setWatching] = useState<DuplicateMatch | undefined>(undefined);
  const [watched, setWatched] = useState<{ readonly match: DuplicateMatch; readonly outcome: WatchOutcome } | undefined>(undefined);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  // D-A13-5: the open match the bar's “ใช่ ติดตามเรื่องนี้” watches (the first, unless another is picked).
  const [chosenId, setChosenId] = useState<string | undefined>(undefined);
  const [qrMessage, setQrMessage] = useState<string | undefined>(qr === undefined || qr.state === 'ok' ? undefined : QR_MESSAGES[qr.state]);
  const { step, locationId, areaId, symptomKey, fromQr } = selection;
  const location = options.locations.find((place) => place.id === locationId);
  const areas = options.areas.filter((area) => area.location_id === locationId);
  const area = areas.find((candidate) => candidate.id === areaId);
  const symptom = options.symptoms.find((candidate) => candidate.key === symptomKey);
  const title =
    location === undefined || symptom === undefined ? undefined : repairTitlePreview({ symptomLabel: symptom.label, areaLabel: area?.label, locationLabel: location.label });
  const placeText = location === undefined ? undefined : areaId === undefined ? location.label : `${location.label} · ${area?.label ?? 'ไม่ระบุบริเวณ'}`;
  const isOther = symptomKey === OTHER_SYMPTOM_KEY;

  // FU-47: the choices and the text kept in this tab's session while the form is open; gone once sent.
  useEffect(() => {
    if (sent !== undefined || watched !== undefined) return;
    saveRepairDraft(window.sessionStorage, { personId, step, locationId, areaId, symptomKey, description, commandId, dismissed: [...dismissed] });
  }, [personId, step, locationId, areaId, symptomKey, description, commandId, dismissed, sent, watched]);

  const go = (next: Step) => {
    setError(undefined);
    setDuplicates({ kind: 'idle' });
    setSelection((current) => ({ ...current, step: next }));
    window.scrollTo({ top: 0 });
  };
  const checkDuplicates = async (skip: ReadonlySet<string> = dismissed) => {
    if (locationId === undefined || symptomKey === undefined) return;
    setDuplicates({ kind: 'checking' });
    try {
      const found = await fetchDuplicates({ locationId, areaId: areaId === '' ? undefined : areaId, symptomKey });
      const matches = found.filter((match) => !skip.has(match.request_id));
      if (matches.length === 0) return go(4);
      setDuplicates({ kind: 'matches', matches, origin: 'check' });
      setChosenId(watchable(matches)[0]?.request_id);
      window.scrollTo({ top: 0 });
    } catch {
      // Never read as “no duplicate” (U1): say the check failed.
      setDuplicates({ kind: 'failed' });
    }
  };
  const forward = () => {
    setNotice(undefined);
    if (step === 1 && location === undefined) return setError('เลือกสถานที่ก่อน');
    if (step === 2 && areaId === undefined) return setError('เลือกบริเวณ หรือ “ไม่ระบุ” ก่อน');
    if (step === 3 && symptom === undefined) return setError('เลือกอาการก่อน');
    if (step === 3 && symptomKey !== OTHER_SYMPTOM_KEY) {
      setError(undefined);
      return void checkDuplicates();
    }
    go((step + 1) as Step);
  };
  const backward = () => {
    setNotice(undefined);
    if (duplicates.kind === 'matches' || duplicates.kind === 'failed') return setDuplicates({ kind: 'idle' });
    setSending({ kind: 'idle' });
    go((step - 1) as Step);
  };

  /** A14: sends the request; `skip` = the matches answered “ไม่ใช่” (not asked again, FU-49). */
  const send = async (skip: ReadonlySet<string> = dismissed) => {
    if (sending.kind === 'sending' || locationId === undefined || symptomKey === undefined) return;
    setNotice(undefined);
    if (isOther && description.trim() === '') {
      setFieldError('อธิบายอาการก่อนส่ง');
      detailsRef.current?.focus();
      return;
    }
    setFieldError(undefined);
    setSending({ kind: 'sending' });
    const text = description.trim();
    const known = [...skip].slice(0, MAX_SENT_DISMISSED);
    try {
      const reply = await apiCall<CreateReply>('POST', '/api/commands', {
        command_id: commandId,
        type: 'create_maintenance',
        payload: {
          location_id: locationId,
          ...(areaId === undefined || areaId === '' ? {} : { area_id: areaId }),
          symptom_key: symptomKey,
          ...(text === '' ? {} : { description: text }),
          ...(known.length === 0 ? {} : { known_duplicate_ids: known }),
        },
      });
      clearRepairDraft(window.sessionStorage);
      setSent({ requestId: reply.result.request_id, number: reply.result.request_number, isAssigned: reply.result.is_assigned === true, assigneeLabel: reply.result.assignee_label });
      setSending({ kind: 'idle' });
      window.scrollTo({ top: 0 });
    } catch (caught) {
      const failure = caught instanceof ApiCallError ? caught : new ApiCallError(0, 'NETWORK');
      if (failure.code === 'DUPLICATE_FOUND') return void showSendDuplicates(skip);
      if (failure.status === 0) return setSending({ kind: 'unknown' });
      if (failure.status === 503) return setSending({ kind: 'not_ready', code: failure.code });
      if (PLACE_GONE.has(failure.code)) return setSending({ kind: 'place_gone' });
      if (failure.code === 'DESCRIPTION_REQUIRED') {
        setSending({ kind: 'idle' });
        setFieldError('อธิบายอาการก่อนส่ง');
        return detailsRef.current?.focus();
      }
      // The first press went through with what was typed then: that request stands.
      if (failure.code === 'COMMAND_ID_CONFLICT') {
        clearRepairDraft(window.sessionStorage);
        return setSending({ kind: 'already_sent' });
      }
      if (failure.status === 401 || failure.status === 403) {
        return setSending({ kind: 'failed', message: 'บัญชีนี้ส่งเรื่องไม่ได้ตอนนี้ เข้าสู่ระบบใหม่ หรือติดต่อทีม GM' });
      }
      setSending({ kind: 'failed', message: 'ส่งไม่สำเร็จ ข้อมูลที่กรอกยังอยู่ ลองส่งอีกครั้ง ถ้ายังไม่ได้ติดต่อทีม GM' });
    }
  };

  /** FU-49: a match appeared while the form was filled — the interstitial again, nothing typed lost. */
  const showSendDuplicates = async (skip: ReadonlySet<string>) => {
    if (locationId === undefined || symptomKey === undefined) return;
    try {
      const found = await fetchDuplicates({ locationId, areaId: areaId === '' ? undefined : areaId, symptomKey });
      const matches = found.filter((match) => !skip.has(match.request_id));
      setSending({ kind: 'idle' });
      if (matches.length === 0) {
        // Gone again (closed meanwhile): send as it is.
        return void send(skip);
      }
      setDuplicates({ kind: 'matches', matches, origin: 'send' });
      setChosenId(watchable(matches)[0]?.request_id);
      window.scrollTo({ top: 0 });
    } catch {
      setSending({ kind: 'failed', message: 'มีคนแจ้งเรื่องที่ตรงกันระหว่างที่กรอก แต่ตรวจรายการไม่ได้ ลองส่งอีกครั้ง' });
    }
  };

  const notSame = () => {
    if (duplicates.kind !== 'matches') return go(4);
    const next = new Set([...dismissed, ...duplicates.matches.map((match) => match.request_id)]);
    setDismissed(next);
    if (duplicates.origin === 'check') return go(4);
    // Answered “ไม่ใช่” when sending: send now, without asking again (U1).
    setDuplicates({ kind: 'idle' });
    void send(next);
  };
  const changePlace = () => {
    setNotice(undefined);
    setSending({ kind: 'idle' });
    setDuplicates({ kind: 'idle' });
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
        if (duplicates.kind === 'matches' && duplicates.origin === 'check') {
          return <DuplicateList matches={duplicates.matches} chosenId={chosenId} onChoose={setChosenId} backLabel="ย้อนกลับไปเลือกอาการ" onBack={backward} />;
        }
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
        if (duplicates.kind === 'matches') {
          return <DuplicateList matches={duplicates.matches} chosenId={chosenId} onChoose={setChosenId} backLabel="ย้อนกลับไปแก้รายละเอียด" onBack={backward} />;
        }
        return (
          <div className="gm-repair-details" data-testid="repair-details">
            <div className="gm-field">
              <label htmlFor={detailsId}>{isOther ? 'อธิบายอาการ (ต้องกรอก)' : 'รายละเอียดเพิ่มเติม (ไม่บังคับ)'}</label>
              <textarea
                ref={detailsRef}
                id={detailsId}
                className="gm-input gm-repair-textarea"
                value={description}
                required={isOther}
                aria-invalid={fieldError !== undefined}
                aria-describedby={`${detailsId}-hint`}
                onChange={(event) => {
                  setDescription(event.target.value);
                  setFieldError(undefined);
                }}
              />
              <p id={`${detailsId}-hint`} className="gm-admin-muted">
                {isOther ? 'บอกว่าเกิดอะไรและอยู่ตรงไหน ' : 'เช่น จุดที่เกิดปัญหา หรือสิ่งที่ช่างควรรู้ '}ข้อความนี้ทีม GM และคุณเห็นเท่านั้น ไม่ขึ้นบนบอร์ด
              </p>
            </div>
          </div>
        );
    }
  })();

  if (watched !== undefined) {
    return (
      <div className="gm-repair gm-repair--done">
        <Watched match={watched.match} outcome={watched.outcome} />
      </div>
    );
  }
  if (sent !== undefined) {
    return (
      <div className="gm-repair gm-repair--done">
        <section className="gm-dup-done" data-testid="repair-sent" aria-labelledby="repair-sent-heading">
          <span className="gm-dup-done-mark" aria-hidden="true">
            <Icon name="check" />
          </span>
          <h2 id="repair-sent-heading" tabIndex={-1}>
            ส่งเรื่องเรียบร้อยแล้ว
          </h2>
          <p className="gm-repair-sent-number">{sent.number}</p>
          {title !== undefined && <p className="gm-dup-title">{title}</p>}
          <p>ทีม GM ได้รับแจ้งแล้ว ติดตามความคืบหน้าได้ในคำขอของฉัน</p>
          <p className="gm-admin-muted gm-repair-sent-meta">
            {sent.isAssigned && sent.assigneeLabel !== undefined ? (
              <>
                <span>{`ผู้รับผิดชอบ: ${sent.assigneeLabel}`}</span> · <span>สถานะ รอคิว</span>
              </>
            ) : (
              <span>ยังไม่มอบหมาย — รอทีม GM รับเรื่อง</span>
            )}
          </p>
          <div className="gm-actions">
            <Link to={requestPath(sent.requestId)} className="gm-btn gm-btn--primary">
              ดูงานของฉัน
            </Link>
            <Link to={HOME_PATH} className="gm-btn gm-btn--secondary">
              กลับหน้าแรก
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const showingMatches = duplicates.kind === 'matches' && ((step === 3 && duplicates.origin === 'check') || (step === 4 && duplicates.origin === 'send'));
  const chosen = showingMatches ? watchable(duplicates.matches).find((match) => match.request_id === chosenId) : undefined;
  return (
    <div className="gm-repair">
      <Stepper step={step} />
      {notice !== undefined && (
        <p className="gm-notice gm-notice--warning" role="alert">
          {notice}
        </p>
      )}
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
        <h2 id="repair-step-heading">{showingMatches ? 'มีคนแจ้งเรื่องนี้แล้ว' : STEP_TITLES[step - 1]}</h2>
        {error !== undefined && (
          <p className="gm-notice gm-notice--danger" role="alert">
            {error}
          </p>
        )}
        {step === 3 && duplicates.kind === 'failed' && (
          <div className="gm-notice gm-notice--warning gm-dup-failed" data-testid="repair-duplicates-failed">
            <p className="font-semibold" role="alert">
              ตรวจงานซ้ำไม่ได้
            </p>
            <p>ยังไม่รู้ว่ามีคนแจ้งเรื่องนี้แล้วหรือไม่ ลองตรวจอีกครั้ง หรือแจ้งเรื่องใหม่ต่อได้</p>
            <div className="gm-admin-row-buttons">
              <button type="button" className="gm-btn gm-btn--secondary" onClick={() => void checkDuplicates()}>
                ลองอีกครั้ง
              </button>
              <button type="button" className="gm-btn gm-btn--secondary" onClick={() => go(4)}>
                แจ้งเรื่องใหม่ต่อ
              </button>
            </div>
          </div>
        )}
        {step === 3 && duplicates.kind === 'checking' && (
          <p className="gm-admin-muted" role="status">
            กำลังตรวจว่ามีคนแจ้งเรื่องนี้แล้วหรือไม่…
          </p>
        )}
        {step === 4 && fieldError !== undefined && (
          <p className="gm-notice gm-notice--danger" role="alert">
            {fieldError}
          </p>
        )}
        {step === 4 && !showingMatches && <SendState sending={sending} onChoosePlace={changePlace} />}
        {content}
      </section>
      {title !== undefined && step >= 3 && (
        <div className="gm-repair-title" data-testid="repair-title-preview">
          <span className="gm-admin-muted">ชื่อบนบอร์ด · สร้างให้อัตโนมัติ</span>
          <span className="font-semibold">{title}</span>
        </div>
      )}
      <ActionBar>
        {showingMatches ? (
          <>
            {/* D-A13-5: both choices on screen; watching is the primary one. */}
            {chosen !== undefined && (
              <button type="button" className="gm-btn gm-btn--primary gm-repair-bar-main" onClick={() => setWatching(chosen)}>
                <Icon name="bell" />
                ใช่ ติดตามเรื่องนี้
              </button>
            )}
            <button type="button" className="gm-btn gm-btn--secondary" onClick={notSame}>
              แจ้งเรื่องใหม่
            </button>
          </>
        ) : (
          <>
            {step === 1 ? (
              <Link to={HOME_PATH} className="gm-btn gm-btn--secondary">
                <Icon name="back" />
                ออกจากฟอร์ม
              </Link>
            ) : (
              <button type="button" className="gm-btn gm-btn--secondary" onClick={backward}>
                <Icon name="back" />
                ย้อนกลับ
              </button>
            )}
            {step < 4 ? (
              <button type="button" className="gm-btn gm-btn--primary" onClick={forward} disabled={duplicates.kind === 'checking'}>
                ถัดไป
              </button>
            ) : sending.kind === 'already_sent' ? (
              <Link to={MY_REQUESTS_PATH} className="gm-btn gm-btn--primary">
                คำขอของฉัน
              </Link>
            ) : (
              <button type="button" className="gm-btn gm-btn--primary" onClick={() => void send()} disabled={sending.kind === 'sending'} aria-busy={sending.kind === 'sending'}>
                {sending.kind === 'sending' ? 'กำลังส่ง…' : sending.kind === 'unknown' || sending.kind === 'failed' ? 'ส่งอีกครั้ง' : 'ส่งเรื่อง'}
              </button>
            )}
          </>
        )}
      </ActionBar>
      {watching !== undefined && (
        <WatchDialog
          match={watching}
          onCancel={() => setWatching(undefined)}
          onWatched={(outcome) => {
            setWatching(undefined);
            setWatched({ match: watching, outcome });
            window.scrollTo({ top: 0 });
          }}
          onRefused={(why) => {
            setWatching(undefined);
            setNotice(WATCH_REFUSED[why]);
            // The list may have changed: check again (nothing open → step 4).
            void checkDuplicates();
          }}
        />
      )}
    </div>
  );
}

export function RepairPage({ qrId }: { readonly qrId?: string | undefined }) {
  const { state } = useSession();
  const personId = state.kind === 'active' ? state.personId : undefined;
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
      {load.kind === 'ready' && personId !== undefined && <RepairForm key={qrId ?? 'form'} options={load.options} qr={load.qr} personId={personId} />}
    </>
  );
}
