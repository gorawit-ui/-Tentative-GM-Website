// A11 — UI-12 §13.4 ปฏิทินบริษัท (phase A: one company calendar). Open weekdays, holidays and the
// reminder time of FU-30. Years are read and typed in พ.ศ. and stored in ค.ศ.; a year that looks like
// ค.ศ. is refused with a reason before anything is sent (D-S01-6, never shifted by 543 silently), and the
// API refuses it again. A change counts for open requests within 15 minutes (the next tick, D-A05-3)
// and never changes the SLA snapshot of an existing request. Mobile: holidays listed by month;
// desktop: a month view of the year beside the list. All dates come from @gm/time.
import { useId, useState, type FormEvent } from 'react';
import type { AdminCalendarView } from '@gm/contracts';
import { BUDDHIST_ERA_OFFSET, CALENDAR_CE_YEARS, THAI_MONTHS, THAI_WEEKDAYS, bangkokDateOf, datesOfMonth, formatThaiDate, isoDateFromThaiInput, toBuddhistYear, type ThaiDateInputError } from '@gm/time';
import { adminCommand, adminErrorText, getCalendar } from './api';
import { AdminHead, ConfirmDialog, LoadFailed, Loading, SaveLine, useAdminData, useWide, type Saved } from './common';

const SAVED_TEXT = 'บันทึกแล้ว มีผลภายใน 15 นาที';
const PILOT_FROM = '2026-12-01';
const PILOT_TO = '2027-01-31';

function inputError(error: ThaiDateInputError, beYear: string): string {
  switch (error) {
    case 'YEAR_MISSING':
      return 'กรอกปี พ.ศ. เป็นตัวเลข เช่น 2570';
    case 'YEAR_LOOKS_CE':
      return `ปี ${beYear.trim()} ดูเหมือนเป็น ค.ศ. กรอกเป็น พ.ศ. เช่น ${Number(beYear) + BUDDHIST_ERA_OFFSET}`;
    case 'YEAR_OUT_OF_RANGE':
      return `ปี พ.ศ. ต้องอยู่ระหว่าง ${toBuddhistYear(CALENDAR_CE_YEARS.first)}–${toBuddhistYear(CALENDAR_CE_YEARS.last)}`;
    case 'DATE_INVALID':
      return 'ไม่มีวันที่นี้ในปฏิทิน ตรวจวันที่และเดือน';
  }
}

interface DateFields {
  readonly day: string;
  readonly month: string;
  readonly beYear: string;
}

const fieldsOf = (iso: string): DateFields => ({ day: String(Number(iso.slice(8, 10))), month: String(Number(iso.slice(5, 7))), beYear: String(toBuddhistYear(Number(iso.slice(0, 4)))) });

/** Day / month / year (พ.ศ.) / name, with the preview of what will be stored. */
function HolidayFields({ fields, name, onChange, onName, idPrefix }: { readonly fields: DateFields; readonly name: string; readonly onChange: (next: DateFields) => void; readonly onName: (next: string) => void; readonly idPrefix: string }) {
  const monthId = useId();
  const parsed = isoDateFromThaiInput(fields);
  const touched = fields.beYear.trim() !== '' && fields.day.trim() !== '';
  const yearProblem = !parsed.ok && touched && parsed.error !== 'DATE_INVALID';
  return (
    <>
      <div className="gm-holiday-date">
        <label className="gm-field">
          <span>วันที่</span>
          <input className="gm-input" inputMode="numeric" value={fields.day} maxLength={2} onChange={(event) => onChange({ ...fields, day: event.target.value })} required />
        </label>
        <div className="gm-field">
          <label htmlFor={monthId}>เดือน</label>
          <select id={monthId} className="gm-input" value={fields.month} onChange={(event) => onChange({ ...fields, month: event.target.value })}>
            {THAI_MONTHS.map((month, index) => (
              <option key={month} value={String(index + 1)}>
                {month}
              </option>
            ))}
          </select>
        </div>
        <label className="gm-field">
          <span>ปี (พ.ศ.)</span>
          <input
            className="gm-input"
            inputMode="numeric"
            value={fields.beYear}
            maxLength={4}
            aria-invalid={yearProblem ? 'true' : undefined}
            aria-describedby={`${idPrefix}-preview`}
            onChange={(event) => onChange({ ...fields, beYear: event.target.value })}
            required
          />
        </label>
      </div>
      <label className="gm-field">
        <span>ชื่อวันหยุด</span>
        <input className="gm-input" value={name} maxLength={60} onChange={(event) => onName(event.target.value)} placeholder="เช่น วันขึ้นปีใหม่" required />
      </label>
      <p id={`${idPrefix}-preview`} className={`gm-holiday-preview${!parsed.ok && touched ? ' gm-error' : ''}`} data-testid={idPrefix === 'new-holiday' ? 'holiday-preview' : undefined} aria-live="polite">
        {parsed.ok ? `จะบันทึกเป็น ${formatThaiDate(parsed.iso, { weekday: true })}` : touched ? inputError(parsed.error, fields.beYear) : 'กรอกวันที่ เดือน และปี พ.ศ.'}
      </p>
    </>
  );
}

function AddHoliday({ defaultBeYear, onSaved }: { readonly defaultBeYear: number; readonly onSaved: (iso: string) => Promise<void> }) {
  const [fields, setFields] = useState<DateFields>({ day: '', month: '1', beYear: String(defaultBeYear) });
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="gm-admin-panel gm-admin-stack"
      data-testid="holiday-form"
      aria-labelledby="add-holiday-heading"
      onSubmit={async (event: FormEvent) => {
        event.preventDefault();
        const parsed = isoDateFromThaiInput(fields);
        if (!parsed.ok) {
          setError(inputError(parsed.error, fields.beYear));
          return;
        }
        setBusy(true);
        try {
          await adminCommand('put_holiday', { date: parsed.iso, name });
          setError(undefined);
          setFields({ day: '', month: fields.month, beYear: fields.beYear });
          setName('');
          await onSaved(parsed.iso);
        } catch (failure) {
          setError(adminErrorText(failure));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 id="add-holiday-heading">เพิ่มวันหยุด</h2>
      <HolidayFields
        idPrefix="new-holiday"
        fields={fields}
        name={name}
        onChange={(next) => {
          setFields(next);
          setError(undefined);
        }}
        onName={setName}
      />
      {error !== undefined && (
        <p className="gm-notice gm-notice--danger" role="alert">
          {error}
        </p>
      )}
      <div>
        <button type="submit" className="gm-btn gm-btn--primary" disabled={busy}>
          เพิ่มวันหยุด
        </button>
      </div>
    </form>
  );
}

function HolidayRow({ holiday, onSaved }: { readonly holiday: { readonly date: string; readonly name?: string }; readonly onSaved: (text: string, iso?: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState<DateFields>(fieldsOf(holiday.date));
  const [name, setName] = useState(holiday.name ?? '');
  const [error, setError] = useState<string | undefined>(undefined);
  const [confirming, setConfirming] = useState(false);
  const label = `${formatThaiDate(holiday.date, { weekday: true })}${holiday.name === undefined ? '' : ` · ${holiday.name}`}`;
  if (!editing) {
    return (
      <li className="gm-holiday-row">
        <span>{label}</span>
        <div className="gm-admin-row-buttons">
          <button type="button" className="gm-btn gm-btn--secondary" onClick={() => setEditing(true)}>
            แก้ไข
          </button>
          <button type="button" className="gm-btn gm-btn--secondary" onClick={() => setConfirming(true)}>
            ลบ
          </button>
        </div>
        {error !== undefined && (
          <p className="gm-notice gm-notice--danger" role="alert">
            {error}
          </p>
        )}
        {confirming && (
          <ConfirmDialog
            title="ลบวันหยุดนี้?"
            confirm="ลบวันหยุด"
            onCancel={() => setConfirming(false)}
            onConfirm={async () => {
              try {
                await adminCommand('remove_holiday', { date: holiday.date });
                setConfirming(false);
                await onSaved('ลบวันหยุดแล้ว มีผลภายใน 15 นาที');
              } catch (failure) {
                setConfirming(false);
                setError(adminErrorText(failure));
              }
            }}
          >
            <p className="font-semibold">{label}</p>
            <p>วันนี้จะกลับเป็นวันทำงาน งานค้างและการปิดอัตโนมัติจะนับวันนี้ด้วยภายใน 15 นาที</p>
          </ConfirmDialog>
        )}
      </li>
    );
  }
  return (
    <li className="gm-holiday-row">
      <form
        className="gm-admin-stack"
        onSubmit={async (event: FormEvent) => {
          event.preventDefault();
          const parsed = isoDateFromThaiInput(fields);
          if (!parsed.ok) {
            setError(inputError(parsed.error, fields.beYear));
            return;
          }
          try {
            await adminCommand('put_holiday', { date: parsed.iso, name, replaces: holiday.date });
            await onSaved(SAVED_TEXT, parsed.iso);
          } catch (failure) {
            setError(adminErrorText(failure));
          }
        }}
      >
        <HolidayFields idPrefix={`edit-${holiday.date}`} fields={fields} name={name} onChange={setFields} onName={setName} />
        {error !== undefined && (
          <p className="gm-notice gm-notice--danger" role="alert">
            {error}
          </p>
        )}
        <div className="gm-admin-row-buttons">
          <button type="submit" className="gm-btn gm-btn--primary">
            บันทึก
          </button>
          <button type="button" className="gm-btn gm-btn--secondary" onClick={() => setEditing(false)}>
            ยกเลิก
          </button>
        </div>
      </form>
    </li>
  );
}

function MonthView({ ceYear, month, holidays, openWeekdays }: { readonly ceYear: number; readonly month: number; readonly holidays: ReadonlySet<string>; readonly openWeekdays: ReadonlySet<number> }) {
  const dates = datesOfMonth(ceYear, month);
  const offset = (dates[0]?.isoWeekday ?? 1) - 1;
  const closed = dates.filter((date) => holidays.has(date.iso)).length;
  return (
    <div className="gm-month" role="group" aria-label={`${THAI_MONTHS[month - 1]} ${toBuddhistYear(ceYear)}: วันหยุด ${closed} วัน`}>
      <p className="gm-month-title">{THAI_MONTHS[month - 1]}</p>
      <div className="gm-month-grid" aria-hidden="true">
        {THAI_WEEKDAYS.map((day) => (
          <span key={day} className="gm-month-weekday">
            {day.slice(0, 2)}
          </span>
        ))}
        {Array.from({ length: offset }, (_unused, index) => (
          <span key={`blank-${index}`} />
        ))}
        {dates.map((date) => (
          <span key={date.iso} className={holidays.has(date.iso) ? 'gm-day gm-day--holiday' : openWeekdays.has(date.isoWeekday) ? 'gm-day' : 'gm-day gm-day--closed'}>
            {date.day}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * D-A11-1: phase A keeps one company calendar, Monday–Friday — a Saturday chosen for a factory would
 * count for the office too. The days are shown (so the Admin sees what counts) but cannot be changed.
 */
function Weekdays({ calendar }: { readonly calendar: AdminCalendarView }) {
  const open = new Set(calendar.open_weekdays);
  return (
    <section className="gm-admin-panel gm-admin-stack" aria-labelledby="weekdays-heading">
      <h2 id="weekdays-heading">วันทำงานในสัปดาห์</h2>
      <fieldset className="gm-checks" disabled>
        <legend className="gm-sr-only">วันทำงานในสัปดาห์</legend>
        {THAI_WEEKDAYS.map((day, index) => (
          <label key={day} className="gm-check">
            <input type="checkbox" checked={open.has(index + 1)} readOnly />
            <span className="gm-check-box" aria-hidden="true" />
            <span>{day}</span>
          </label>
        ))}
      </fieldset>
      <p className="gm-admin-muted">ทั้งบริษัทใช้จันทร์–ศุกร์ ตั้งวันเปิดทำการเสาร์–อาทิตย์รายสถานที่ได้ในรุ่นถัดไป (B02)</p>
    </section>
  );
}

function ReminderTime({ calendar, onSaved }: { readonly calendar: AdminCalendarView; readonly onSaved: (text: string) => Promise<void> }) {
  const [time, setTime] = useState(calendar.working_morning_time);
  const [error, setError] = useState<string | undefined>(undefined);
  return (
    <form
      className="gm-admin-panel gm-admin-stack"
      aria-labelledby="reminder-heading"
      onSubmit={async (event: FormEvent) => {
        event.preventDefault();
        try {
          await adminCommand('set_reminder_time', { working_morning_time: time });
          setError(undefined);
          await onSaved('บันทึกเวลาแล้ว ใช้กับการเตือนครั้งถัดไป');
        } catch (failure) {
          setError(adminErrorText(failure));
        }
      }}
    >
      <h2 id="reminder-heading">เวลาส่งการเตือนที่เลื่อนจากวันปิด</h2>
      <p className="gm-admin-muted">กด “ติดตามแล้ว + เตือน” ในวันหยุดหรือวันปิด ระบบจะส่งการเตือนเวลานี้ของวันทำการถัดไป{calendar.working_morning_time_is_default ? ' (ค่าเริ่มต้น)' : ''}</p>
      <label className="gm-field gm-field--narrow">
        <span>เวลาส่งการเตือน (Asia/Bangkok)</span>
        <input className="gm-input" type="time" value={time} onChange={(event) => setTime(event.target.value)} required />
      </label>
      {error !== undefined && (
        <p className="gm-notice gm-notice--danger" role="alert">
          {error}
        </p>
      )}
      <div>
        <button type="submit" className="gm-btn gm-btn--secondary">
          บันทึกเวลา
        </button>
      </div>
    </form>
  );
}

function Holidays({ calendar, ceYear, setCeYear, onSaved }: { readonly calendar: AdminCalendarView; readonly ceYear: number; readonly setCeYear: (year: number) => void; readonly onSaved: (text: string, iso?: string) => Promise<void> }) {
  const wide = useWide();
  const [yearText, setYearText] = useState(String(toBuddhistYear(ceYear)));
  const [shownYear, setShownYear] = useState(ceYear);
  if (shownYear !== ceYear) {
    setShownYear(ceYear);
    setYearText(String(toBuddhistYear(ceYear)));
  }
  const ofYear = calendar.holidays.filter((holiday) => holiday.date.startsWith(`${ceYear}-`));
  const holidaySet = new Set(calendar.holidays.map((holiday) => holiday.date));
  const open = new Set(calendar.open_weekdays);
  const months = Array.from({ length: 12 }, (_unused, index) => index + 1);
  const go = (year: number) => {
    if (year >= CALENDAR_CE_YEARS.first && year <= CALENDAR_CE_YEARS.last) setCeYear(year);
  };
  return (
    <section className="gm-admin-stack" aria-labelledby="holidays-heading">
      <h2 id="holidays-heading">วันหยุด</h2>
      <div className="gm-year-nav">
        <button type="button" className="gm-btn gm-btn--secondary" onClick={() => go(ceYear - 1)}>
          ปีก่อน
        </button>
        <label className="gm-field gm-year-field">
          <span>ปีที่แสดง (พ.ศ.)</span>
          <input
            className="gm-input text-h2"
            inputMode="numeric"
            maxLength={4}
            value={yearText}
            onChange={(event) => {
              setYearText(event.target.value);
              const parsed = isoDateFromThaiInput({ day: 1, month: 1, beYear: event.target.value });
              if (parsed.ok) go(Number(parsed.iso.slice(0, 4)));
            }}
          />
        </label>
        <button type="button" className="gm-btn gm-btn--secondary" onClick={() => go(ceYear + 1)}>
          ปีถัดไป
        </button>
      </div>
      <div className={wide ? 'gm-holiday-layout gm-holiday-layout--wide' : 'gm-holiday-layout'}>
        {wide && (
          <div className="gm-admin-panel gm-year-view" aria-label={`ภาพรวมปี ${toBuddhistYear(ceYear)}`} role="group">
            {months.map((month) => (
              <MonthView key={month} ceYear={ceYear} month={month} holidays={holidaySet} openWeekdays={open} />
            ))}
            <p className="gm-admin-muted gm-year-legend">
              <span className="gm-day gm-day--holiday">วันหยุด</span> <span className="gm-day gm-day--closed">ปิดตามวันในสัปดาห์</span>
            </p>
          </div>
        )}
        <div className="gm-admin-panel gm-admin-stack" data-testid="holiday-list">
          {ofYear.length === 0 ? (
            <p className="gm-admin-muted">{`ยังไม่มีวันหยุดในปี ${toBuddhistYear(ceYear)} — ยังไม่มีวันหยุดไม่ได้แปลว่าปฏิทินตรวจแล้ว`}</p>
          ) : (
            months
              .map((month) => ({ month, items: ofYear.filter((holiday) => Number(holiday.date.slice(5, 7)) === month) }))
              .filter((group) => group.items.length > 0)
              .map((group) => (
                <section key={group.month} aria-label={`${THAI_MONTHS[group.month - 1]} ${toBuddhistYear(ceYear)}`}>
                  <h3 className="gm-holiday-month">{`${THAI_MONTHS[group.month - 1]} ${toBuddhistYear(ceYear)}`}</h3>
                  <ul className="gm-holiday-list">
                    {group.items.map((holiday) => (
                      <HolidayRow key={`${holiday.date}-${holiday.name ?? ''}`} holiday={holiday} onSaved={onSaved} />
                    ))}
                  </ul>
                </section>
              ))
          )}
        </div>
      </div>
    </section>
  );
}

function PilotCheck({ calendar }: { readonly calendar: AdminCalendarView }) {
  const inRange = calendar.holidays.filter((holiday) => holiday.date >= PILOT_FROM && holiday.date <= PILOT_TO);
  return (
    <section className="gm-admin-panel gm-admin-stack" data-testid="pilot-check" aria-labelledby="pilot-heading">
      <h2 id="pilot-heading">{`ตรวจก่อน pilot: ${formatThaiDate(PILOT_FROM).split(' ').slice(1).join(' ')} – ${formatThaiDate(PILOT_TO).split(' ').slice(1).join(' ')}`}</h2>
      <p className="gm-admin-muted">เทียบกับประกาศวันหยุดของบริษัทก่อนเริ่ม pilot — ยังไม่มีวันหยุดไม่ได้แปลว่าปฏิทินตรวจแล้ว</p>
      {inRange.length === 0 ? (
        <p>ยังไม่มีวันหยุดในช่วงนี้</p>
      ) : (
        <ul className="gm-holiday-list">
          {inRange.map((holiday) => (
            <li key={holiday.date} className="gm-holiday-row">
              <span>{`${formatThaiDate(holiday.date, { weekday: true })}${holiday.name === undefined ? '' : ` · ${holiday.name}`}`}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function CalendarPage() {
  const { state, reload } = useAdminData(getCalendar);
  const [ceYear, setCeYear] = useState(() => Number(bangkokDateOf(Date.now()).slice(0, 4)));
  const [saved, setSaved] = useState<Saved>({ kind: 'idle' });
  const onSaved = async (text: string, iso?: string) => {
    await reload();
    if (iso !== undefined) setCeYear(Number(iso.slice(0, 4)));
    setSaved({ kind: 'done', text });
  };
  return (
    <>
      <AdminHead title="ปฏิทินบริษัท">
        <p>1 วันทำการ = สะสม 24 ชั่วโมงบนวันที่เปิดทำการ ไม่ใช่ชั่วโมงทำงานหรือกะ</p>
        <p>แก้แล้วมีผลกับงานที่เปิดอยู่ภายใน 15 นาที และไม่เปลี่ยน SLA ที่บันทึกไว้กับงานเดิม</p>
      </AdminHead>
      {state.kind === 'loading' && <Loading what="กำลังโหลดปฏิทิน…" />}
      {state.kind === 'failed' && <LoadFailed onRetry={() => void reload()} />}
      {state.kind === 'ready' && (
        <div className="gm-admin-sections">
          {!state.data.configured && (
            <p className="gm-notice gm-notice--warning" role="status">
              ยังไม่ได้ตั้งปฏิทินบริษัท งานใหม่จะสร้างไม่ได้จนกว่าจะบันทึกวันทำงานหรือวันหยุดอย่างน้อย 1 ครั้ง
            </p>
          )}
          <SaveLine saved={saved} />
          <Weekdays calendar={state.data} />
          <AddHoliday defaultBeYear={toBuddhistYear(ceYear)} onSaved={(iso) => onSaved(SAVED_TEXT, iso)} />
          <Holidays calendar={state.data} ceYear={ceYear} setCeYear={setCeYear} onSaved={onSaved} />
          <PilotCheck calendar={state.data} />
          <ReminderTime key={`reminder-${state.data.working_morning_time}`} calendar={state.data} onSaved={onSaved} />
        </div>
      )}
    </>
  );
}
