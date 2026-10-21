// A10 — P7-ADMIN-01 นำเข้ารายชื่อจาก CSV. The file is read in the browser only: the Admin picks the
// e-mail, display-name, team (FU-10: one value) and Slack ID columns from the file's own header (the real
// Workspace export has not been seen, so nothing is guessed); only those columns go to the API as rows.
// “ตรวจรายการก่อนบันทึก” shows what will be new / updated / unchanged and every bad row with its reason
// before anything is saved. After saving, the file and its rows are dropped from the page. People missing
// from the file are only counted (the list marks them; the Admin decides — nobody is switched off).
import { useId, useMemo, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router';
import { MAX_IMPORT_ROWS, parseCsv, peopleRowsFromTable, type PeopleImportRow } from '@gm/contracts';
import { CSV_ENCODINGS, decodeCsvBytes, detectCsvEncoding, type CsvEncoding } from './csv-encoding';
import { adminPath } from '../routes';
import { adminErrorText, importPeople, previewPeople, type PeoplePreview } from './api';
import { AdminHead, SaveLine, type Saved } from './common';

/** Larger than any company export (3,000 rows); the browser refuses more before reading it. */
const MAX_FILE_BYTES = 2 * 1024 * 1024;

const ROW_PROBLEMS: Readonly<Record<string, string>> = {
  EMAIL_MISSING: 'ไม่มีอีเมล',
  EMAIL_NOT_COMPANY: 'ไม่ใช่อีเมล @tdfb.co',
  EMAIL_DUPLICATE: 'อีเมลซ้ำในไฟล์',
  NAME_MISSING: 'ไม่มีชื่อ',
  NAME_TOO_LONG: 'ชื่อยาวเกิน 100 ตัวอักษร',
  TEAM_TOO_LONG: 'ชื่อทีมยาวเกิน 60 ตัวอักษร',
  SLACK_ID_INVALID: 'Slack ID ไม่ถูกรูปแบบ (ขึ้นต้นด้วย U หรือ W)',
};

const CHANGE_WORDS: Readonly<Record<string, string>> = { name: 'ชื่อ', team: 'ทีม', slack: 'Slack ID' };

type Column = 'email' | 'name' | 'team' | 'slack';
type Mapping = Readonly<Record<Column, string>>;
const NO_MAPPING: Mapping = { email: '', name: '', team: '', slack: '' };

function ColumnSelect({
  label,
  header,
  value,
  optional,
  onChange,
}: {
  readonly label: string;
  readonly header: readonly string[];
  readonly value: string;
  readonly optional: boolean;
  readonly onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="gm-field">
      <label htmlFor={id}>{label}</label>
      <select id={id} className="gm-input" value={value} onChange={(event) => onChange(event.target.value)} required={!optional}>
        <option value="">{optional ? 'ไม่ใช้' : 'เลือกคอลัมน์'}</option>
        {header.map((name, index) => (
          <option key={index} value={String(index)}>
            {name.trim() === '' ? `คอลัมน์ที่ ${index + 1}` : name}
          </option>
        ))}
      </select>
    </div>
  );
}

function Preview({ preview }: { readonly preview: PeoplePreview }) {
  const errors = preview.rows.filter((row) => row.status === 'error');
  const changed = preview.rows.filter((row) => row.status === 'new' || row.status === 'update');
  return (
    <section className="gm-admin-panel gm-admin-stack" aria-labelledby="preview-heading" data-testid="import-preview">
      <h2 id="preview-heading">ผลตรวจก่อนบันทึก</h2>
      <ul className="gm-import-counts">
        <li>{`ใหม่ ${preview.counts.new}`}</li>
        <li>{`อัปเดต ${preview.counts.update}`}</li>
        <li>{`เหมือนเดิม ${preview.counts.same}`}</li>
        <li>{`ผิด ${preview.counts.error}`}</li>
        <li>{`ไม่อยู่ในไฟล์ ${preview.not_in_file}`}</li>
      </ul>
      {preview.not_in_file > 0 && <p className="gm-admin-muted">คนที่ไม่อยู่ในไฟล์จะไม่ถูกปิดบัญชี — หน้ารายชื่อจะขึ้นป้าย “ไม่อยู่ในไฟล์ล่าสุด” ให้ตัดสินเอง</p>}
      {errors.length > 0 && (
        <div className="gm-admin-stack">
          <h3>{`แถวที่ผิด ${errors.length} แถว (ไม่บันทึก แก้ในไฟล์แล้วนำเข้าใหม่ได้)`}</h3>
          <ul className="gm-import-rows" data-testid="import-errors">
            {errors.map((row) => (
              <li key={row.line}>
                <span className="font-semibold">{`แถว ${row.line}`}</span>
                <span className="gm-import-email">{row.email === '' ? 'ไม่มีอีเมล' : row.email}</span>
                <span>{(row.codes ?? []).map((code) => ROW_PROBLEMS[code] ?? code).join(' · ')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {changed.length > 0 && (
        <div className="gm-admin-stack">
          <h3>คนที่จะเพิ่มหรืออัปเดต</h3>
          <ul className="gm-import-rows">
            {changed.map((row) => (
              <li key={row.line}>
                <span className="font-semibold">{`แถว ${row.line}`}</span>
                <span className="gm-import-email">{row.email}</span>
                <span>{row.status === 'new' ? 'คนใหม่ (พนักงานทั่วไป)' : `เปลี่ยน${(row.changes ?? []).map((change) => CHANGE_WORDS[change] ?? change).join(' ')}`}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** D-A10-3: the encodings in words; Excel in Thai Windows saves “CSV” as Windows-874. */
const ENCODING_LABELS: Readonly<Record<CsvEncoding, string>> = {
  'utf-8': 'UTF-8',
  'utf-16le': 'UTF-16 LE (Excel “Unicode Text”)',
  'utf-16be': 'UTF-16 BE',
  'windows-874': 'Windows-874 (Excel ภาษาไทย)',
};
const PREVIEW_ROWS = 3;

/** The file's bytes read in one encoding: the parsed table, or why it cannot be used. */
function tableOf(bytes: Uint8Array, encoding: CsvEncoding): { readonly table?: readonly (readonly string[])[]; readonly problem?: string } {
  try {
    const parsed = parseCsv(decodeCsvBytes(bytes, encoding).text);
    if (parsed.length < 2) return { problem: 'ไฟล์ไม่มีข้อมูล ต้องมีแถวหัวคอลัมน์และรายชื่ออย่างน้อย 1 แถว' };
    if (parsed.length - 1 > MAX_IMPORT_ROWS) return { problem: `ไฟล์มีมากกว่า ${MAX_IMPORT_ROWS} แถว แบ่งไฟล์แล้วนำเข้าทีละส่วน` };
    return { table: parsed };
  } catch {
    return { problem: 'อ่านไฟล์ด้วยชนิดนี้ไม่ได้ ลองเลือกชนิดไฟล์อื่น หรือตรวจว่าเป็นไฟล์ CSV' };
  }
}

/** D-A10-3: the guessed encoding and the first rows; the Admin confirms they read as Thai (or picks another). */
function EncodingCheck({
  guessed,
  encoding,
  table,
  problem,
  onEncoding,
  onConfirm,
}: {
  readonly guessed: CsvEncoding;
  readonly encoding: CsvEncoding;
  readonly table: readonly (readonly string[])[] | undefined;
  readonly problem: string | undefined;
  readonly onEncoding: (encoding: CsvEncoding) => void;
  readonly onConfirm: () => void;
}) {
  const id = useId();
  return (
    <section className="gm-admin-panel gm-admin-stack" aria-labelledby="encoding-heading" data-testid="import-encoding">
      <h2 id="encoding-heading">2. ตรวจว่าอ่านภาษาไทยออก</h2>
      <p>{`ระบบเดาว่าเป็น ${ENCODING_LABELS[guessed]} — ดู ${PREVIEW_ROWS} แถวแรกด้านล่าง ถ้าภาษาไทยเป็นตัวแปลก ๆ ให้เลือกชนิดไฟล์อื่น`}</p>
      <div className="gm-field gm-field--narrow">
        <label htmlFor={id}>ชนิดไฟล์ (การเข้ารหัส)</label>
        <select id={id} className="gm-input" value={encoding} onChange={(event) => onEncoding(event.target.value as CsvEncoding)}>
          {CSV_ENCODINGS.map((option) => (
            <option key={option} value={option}>
              {ENCODING_LABELS[option]}
            </option>
          ))}
        </select>
      </div>
      {problem !== undefined ? (
        <p className="gm-notice gm-notice--danger" role="alert">
          {problem}
        </p>
      ) : (
        <ol className="gm-import-rows">
          {(table ?? []).slice(1, 1 + PREVIEW_ROWS).map((cells, index) => (
            <li key={index}>
              <span className="font-semibold">{`แถว ${index + 2}`}</span>
              <span>{cells.filter((cell) => cell.trim() !== '').join(' · ')}</span>
            </li>
          ))}
        </ol>
      )}
      <div>
        <button type="button" className="gm-btn gm-btn--primary" disabled={problem !== undefined} onClick={onConfirm}>
          อ่านออกถูกต้อง ไปเลือกคอลัมน์
        </button>
      </div>
    </section>
  );
}

export function PeopleImportPage() {
  const fileId = useId();
  const [fileKey, setFileKey] = useState(0);
  const [file, setFile] = useState<{ readonly bytes: Uint8Array; readonly guessed: CsvEncoding } | undefined>(undefined);
  const [encoding, setEncoding] = useState<CsvEncoding>('utf-8');
  const [confirmed, setConfirmed] = useState(false);
  // Parsed once per file and encoding, not on every keystroke.
  const read = useMemo(() => (file === undefined ? undefined : tableOf(file.bytes, encoding)), [file, encoding]);
  const table = confirmed ? read?.table : undefined;
  const [mapping, setMapping] = useState<Mapping>(NO_MAPPING);
  const [rows, setRows] = useState<readonly PeopleImportRow[] | undefined>(undefined);
  const [preview, setPreview] = useState<PeoplePreview | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<Saved>({ kind: 'idle' });

  const forget = () => {
    setRows(undefined);
    setPreview(undefined);
  };

  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0];
    setFile(undefined);
    setConfirmed(false);
    setMapping(NO_MAPPING);
    forget();
    setSaved({ kind: 'idle' });
    if (chosen === undefined) return;
    if (chosen.size > MAX_FILE_BYTES) {
      setSaved({ kind: 'error', text: 'ไฟล์ใหญ่เกิน 2 MB ตรวจว่าเป็นไฟล์รายชื่อที่ถูกต้อง' });
      return;
    }
    const bytes = new Uint8Array(await chosen.arrayBuffer());
    const guessed = detectCsvEncoding(bytes);
    setEncoding(guessed);
    setFile({ bytes, guessed });
  };

  const choose = (column: Column) => (value: string) => {
    setMapping((current) => ({ ...current, [column]: value }));
    forget();
  };

  const check = async () => {
    if (table === undefined) return;
    const column = (value: string) => (value === '' ? undefined : Number(value));
    let mapped: PeopleImportRow[];
    try {
      const email = column(mapping.email);
      const name = column(mapping.name);
      if (email === undefined || name === undefined) {
        setSaved({ kind: 'error', text: 'เลือกคอลัมน์อีเมลและคอลัมน์ชื่อที่แสดงก่อน' });
        return;
      }
      mapped = peopleRowsFromTable(table, { email, name, team: column(mapping.team), slack: column(mapping.slack) });
    } catch {
      setSaved({ kind: 'error', text: 'เลือกคอลัมน์ซ้ำกัน แต่ละช่องต้องเป็นคนละคอลัมน์' });
      return;
    }
    setBusy(true);
    try {
      setPreview(await previewPeople(mapped, mapping.slack !== ''));
      setRows(mapped);
      setSaved({ kind: 'idle' });
    } catch (error) {
      setSaved({ kind: 'error', text: adminErrorText(error) });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (rows === undefined) return;
    setBusy(true);
    try {
      const reply = await importPeople(crypto.randomUUID(), rows, mapping.slack !== '');
      const result = reply.result;
      // The file and its rows are not kept once saved (P7-ADMIN-01).
      setFile(undefined);
      setConfirmed(false);
      setMapping(NO_MAPPING);
      forget();
      setFileKey((key) => key + 1);
      setSaved({
        kind: 'done',
        text: `นำเข้าแล้ว: เพิ่ม ${result.created} คน อัปเดต ${result.updated} คน เหมือนเดิม ${result.unchanged} คน${result.not_in_file > 0 ? ` · ไม่อยู่ในไฟล์ ${result.not_in_file} คน (ไม่ถูกปิดบัญชี)` : ''}`,
      });
    } catch (error) {
      setSaved({ kind: 'error', text: adminErrorText(error) });
    } finally {
      setBusy(false);
    }
  };

  const savable = preview === undefined ? 0 : preview.counts.new + preview.counts.update + preview.counts.same;

  return (
    <>
      <AdminHead title="นำเข้ารายชื่อจาก CSV">
        <p>ใช้ไฟล์รายชื่อที่ export จาก Google Workspace ไฟล์อ่านในเบราว์เซอร์เท่านั้น ส่งเฉพาะคอลัมน์ที่เลือกและไม่เก็บไฟล์หลังนำเข้า</p>
      </AdminHead>
      <div className="gm-admin-sections">
        <div className="gm-admin-row-buttons">
          <Link className="gm-btn gm-btn--secondary" to={adminPath('users')}>
            กลับไปรายชื่อ
          </Link>
        </div>
        <section className="gm-admin-panel gm-admin-stack" aria-labelledby="file-heading">
          <h2 id="file-heading">1. เลือกไฟล์</h2>
          <div className="gm-field">
            <label htmlFor={fileId}>ไฟล์ CSV รายชื่อพนักงาน</label>
            <input key={fileKey} id={fileId} className="gm-input gm-file-input" type="file" accept=".csv,text/csv" onChange={(event) => void readFile(event)} />
          </div>
          <p className="gm-admin-muted">คนใหม่เป็นพนักงานทั่วไป ตั้งสิทธิ์ที่หน้ารายชื่อ · คนเดิมอัปเดตชื่อและทีม (สิทธิ์และบัญชีไม่เปลี่ยน)</p>
        </section>
        {file !== undefined && !confirmed && (
          <EncodingCheck
            guessed={file.guessed}
            encoding={encoding}
            table={read?.table}
            problem={read?.problem}
            onEncoding={setEncoding}
            onConfirm={() => setConfirmed(true)}
          />
        )}
        {table !== undefined && (
          <section className="gm-admin-panel gm-admin-stack" aria-labelledby="columns-heading">
            <h2 id="columns-heading">{`3. เลือกคอลัมน์ (${table.length - 1} แถว)`}</h2>
            <div className="gm-import-columns">
              <ColumnSelect label="คอลัมน์อีเมล" header={table[0] ?? []} value={mapping.email} optional={false} onChange={choose('email')} />
              <ColumnSelect label="คอลัมน์ชื่อที่แสดง" header={table[0] ?? []} value={mapping.name} optional={false} onChange={choose('name')} />
              <ColumnSelect label="คอลัมน์ทีม (ไม่บังคับ)" header={table[0] ?? []} value={mapping.team} optional onChange={choose('team')} />
              <ColumnSelect label="คอลัมน์ Slack ID (ไม่บังคับ)" header={table[0] ?? []} value={mapping.slack} optional onChange={choose('slack')} />
            </div>
            <p className="gm-admin-muted">ไม่เลือกคอลัมน์ทีม: ทีมของคนเดิมไม่เปลี่ยน · เลือกคอลัมน์ Slack ID แล้วช่องว่างจะล้าง Slack ID เดิม (ส่งทางอีเมลแทน)</p>
            <div>
              <button type="button" className="gm-btn gm-btn--primary" disabled={busy} onClick={() => void check()}>
                ตรวจรายการก่อนบันทึก
              </button>
            </div>
          </section>
        )}
        <SaveLine saved={saved} />
        {preview !== undefined && (
          <>
            <Preview preview={preview} />
            <div className="gm-admin-row-buttons">
              <button type="button" className="gm-btn gm-btn--primary" disabled={busy || savable === 0} onClick={() => void save()}>
                {`บันทึก ${savable} รายการ`}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
