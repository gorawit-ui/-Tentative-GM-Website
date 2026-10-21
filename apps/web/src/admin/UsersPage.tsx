// A10 — UI-12 §13.3 รายชื่อพนักงานและสิทธิ์: search by name or e-mail; each person's role, account,
// Slack mapped or not (e-mail is used when not), signed in or not, and “ไม่อยู่ในไฟล์ล่าสุด” when the
// latest import did not have them (the Admin decides — nobody is switched off by an import). A role or
// account change names the person and the new state in a confirmation first (§13.3: no surprise, no
// self-escalation — the API checks GM Admin and keeps the last one). People who signed in but are not
// on the list (D-A09-1) are listed with “เพิ่มเข้ารายชื่อ”. Mobile: cards; desktop: a table.
import { useCallback, useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ROLES, type Role } from '@gm/domain';
import { formatThaiDateTime } from '@gm/time';
import { ROLE_LABELS } from '../labels';
import { PEOPLE_IMPORT_PATH } from '../routes';
import { adminCommand, adminErrorText, getPeople, getUnlisted, type PersonView, type UnlistedLogin } from './api';
import { AdminHead, ConfirmDialog, LoadFailed, Loading, SaveLine, useAdminData, useWide, type Saved } from './common';

type Run = (type: string, payload: Record<string, unknown>, done: string) => Promise<boolean>;

/** The state of a person in words (never colour alone). */
function PersonFacts({ person, imported }: { readonly person: PersonView; readonly imported: boolean }) {
  return (
    <ul className="gm-person-facts">
      <li>{ROLE_LABELS[person.role]}</li>
      <li>{person.slack_mapped ? 'Slack จับคู่แล้ว' : 'ยังไม่จับคู่ Slack (ส่งทางอีเมล)'}</li>
      <li>{person.linked ? 'เข้าสู่ระบบแล้ว' : 'ยังไม่เคยเข้าสู่ระบบ'}</li>
      {imported && !person.in_latest_import && <li className="gm-person-flag">ไม่อยู่ในไฟล์ล่าสุด</li>}
    </ul>
  );
}

function AccountBadge({ active }: { readonly active: boolean }) {
  return <span className={`gm-badge ${active ? 'gm-badge--ok' : 'gm-badge--muted'}`}>{active ? 'ใช้งาน' : 'ปิดบัญชีแล้ว'}</span>;
}

type Pending = { readonly kind: 'role'; readonly role: Role } | { readonly kind: 'active'; readonly active: boolean };

function PersonActions({ person, run }: { readonly person: PersonView; readonly run: Run }) {
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState<Role>(person.role);
  const [pending, setPending] = useState<Pending | undefined>(undefined);
  const roleId = useId();
  const who = (
    <>
      <p className="font-semibold">{person.name}</p>
      <p className="gm-admin-muted">{person.person_id}</p>
    </>
  );
  return (
    <div className="gm-admin-stack">
      {editing ? (
        <form
          className="gm-admin-add-form"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            if (role !== person.role) setPending({ kind: 'role', role });
            else setEditing(false);
          }}
        >
          <div className="gm-field">
            <label htmlFor={roleId}>สิทธิ์ใหม่</label>
            <select id={roleId} className="gm-input" value={role} onChange={(event) => setRole(event.target.value as Role)}>
              {ROLES.map((option) => (
                <option key={option} value={option}>
                  {ROLE_LABELS[option]}
                </option>
              ))}
            </select>
          </div>
          <div className="gm-admin-row-buttons">
            <button type="submit" className="gm-btn gm-btn--primary">
              บันทึกสิทธิ์
            </button>
            <button
              type="button"
              className="gm-btn gm-btn--secondary"
              onClick={() => {
                setRole(person.role);
                setEditing(false);
              }}
            >
              ยกเลิก
            </button>
          </div>
        </form>
      ) : (
        <div className="gm-admin-row-buttons">
          <button type="button" className="gm-btn gm-btn--secondary" onClick={() => setEditing(true)}>
            เปลี่ยนสิทธิ์
          </button>
          <button type="button" className="gm-btn gm-btn--secondary" onClick={() => setPending({ kind: 'active', active: !person.active })}>
            {person.active ? 'ปิดบัญชี' : 'เปิดบัญชี'}
          </button>
        </div>
      )}
      {pending?.kind === 'role' && (
        <ConfirmDialog
          title="เปลี่ยนสิทธิ์?"
          confirm="เปลี่ยนสิทธิ์"
          onCancel={() => setPending(undefined)}
          onConfirm={async () => {
            const ok = await run('set_person_role', { person_id: person.person_id, role: pending.role }, `เปลี่ยนสิทธิ์ของ ${person.name} เป็น ${ROLE_LABELS[pending.role]} แล้ว`);
            setPending(undefined);
            if (ok) setEditing(false);
          }}
        >
          {who}
          <p>{`จาก ${ROLE_LABELS[person.role]} เป็น ${ROLE_LABELS[pending.role]} — มีผลทันทีในคำขอถัดไปของคนนี้`}</p>
        </ConfirmDialog>
      )}
      {pending?.kind === 'active' && (
        <ConfirmDialog
          title={pending.active ? 'เปิดบัญชีนี้?' : 'ปิดบัญชีนี้?'}
          confirm={pending.active ? 'เปิดบัญชี' : 'ปิดบัญชี'}
          onCancel={() => setPending(undefined)}
          onConfirm={async () => {
            await run('set_person_active', { person_id: person.person_id, active: pending.active }, pending.active ? `เปิดบัญชีของ ${person.name} แล้ว` : `ปิดบัญชีของ ${person.name} แล้ว`);
            setPending(undefined);
          }}
        >
          {who}
          <p>{pending.active ? 'คนนี้กลับมาใช้งานได้ทันที' : 'คนนี้ใช้งานไม่ได้ทันที ข้อมูลและงานเดิมยังอยู่ เปิดกลับได้'}</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

function PeopleList({ people, imported, run }: { readonly people: readonly PersonView[]; readonly imported: boolean; readonly run: Run }) {
  const wide = useWide();
  if (people.length === 0) return <p className="gm-admin-empty" data-testid="people-list">ไม่พบคนที่ค้น</p>;
  if (wide) {
    return (
      <div className="gm-admin-panel" data-testid="people-list">
        <table className="gm-admin-table" aria-label="รายชื่อพนักงาน">
          <thead>
            <tr>
              <th scope="col">ชื่อ / อีเมล</th>
              <th scope="col">ทีม</th>
              <th scope="col">สิทธิ์และสถานะ</th>
              <th scope="col">บัญชี</th>
              <th scope="col">
                <span className="gm-sr-only">จัดการ</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {people.map((person) => (
              <tr key={person.person_id}>
                <td>
                  <span className="font-semibold">{person.name}</span>
                  <br />
                  <span className="gm-admin-muted">{person.person_id}</span>
                </td>
                <td>{person.team_label ?? 'ไม่ระบุทีม'}</td>
                <td>
                  <PersonFacts person={person} imported={imported} />
                </td>
                <td>
                  <AccountBadge active={person.active} />
                </td>
                <td>
                  <PersonActions key={`${person.person_id}-${person.role}-${person.active}`} person={person} run={run} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <ul className="gm-admin-cards" data-testid="people-list">
      {people.map((person) => (
        <li key={person.person_id} className="gm-admin-card">
          <div className="gm-admin-card-head">
            <span className="font-semibold">{person.name}</span>
            <AccountBadge active={person.active} />
          </div>
          <p className="gm-admin-muted">{person.person_id}</p>
          <p>{person.team_label ?? 'ไม่ระบุทีม'}</p>
          <PersonFacts person={person} imported={imported} />
          <PersonActions key={`${person.person_id}-${person.role}-${person.active}`} person={person} run={run} />
        </li>
      ))}
    </ul>
  );
}

function UnlistedEntry({ entry, run }: { readonly entry: UnlistedLogin; readonly run: Run }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [team, setTeam] = useState('');
  return (
    <li className="gm-admin-card">
      <div className="gm-admin-card-head">
        <span className="font-semibold">{entry.email}</span>
        <span className="gm-admin-muted">{`ล่าสุด ${formatThaiDateTime(entry.last_seen_at)} · ${entry.count} ครั้ง`}</span>
      </div>
      {adding ? (
        <form
          className="gm-admin-stack"
          onSubmit={async (event: FormEvent) => {
            event.preventDefault();
            if (await run('add_person', { email: entry.email, name, ...(team.trim() === '' ? {} : { team }) }, `เพิ่ม ${entry.email} เข้ารายชื่อแล้ว เข้าใช้งานได้ทันที`)) setAdding(false);
          }}
        >
          <label className="gm-field">
            <span>ชื่อที่แสดง</span>
            <input className="gm-input" value={name} maxLength={100} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label className="gm-field">
            <span>ทีม (ไม่บังคับ)</span>
            <input className="gm-input" value={team} maxLength={60} onChange={(event) => setTeam(event.target.value)} />
          </label>
          <div className="gm-admin-row-buttons">
            <button type="submit" className="gm-btn gm-btn--primary">
              เพิ่ม
            </button>
            <button type="button" className="gm-btn gm-btn--secondary" onClick={() => setAdding(false)}>
              ยกเลิก
            </button>
          </div>
        </form>
      ) : (
        <div>
          <button type="button" className="gm-btn gm-btn--secondary" onClick={() => setAdding(true)}>
            เพิ่มเข้ารายชื่อ
          </button>
        </div>
      )}
    </li>
  );
}

export function UsersPage() {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(0);
  const loadPeople = useCallback(async () => {
    // “ดูเพิ่ม” keeps the pages already shown.
    const pages = [];
    let offset: number | undefined = 0;
    do {
      const page = await getPeople(search, offset);
      pages.push(page);
      offset = page.next_offset;
    } while (offset !== undefined && offset <= limit);
    return { people: pages.flatMap((page) => page.people), total: pages[0]?.total ?? 0, more: offset !== undefined, imported: pages[0]?.latest_import !== undefined };
  }, [search, limit]);
  const people = useAdminData(loadPeople);
  const unlisted = useAdminData(getUnlisted);
  const [saved, setSaved] = useState<Saved>({ kind: 'idle' });

  const run: Run = async (type, payload, done) => {
    try {
      await adminCommand(type, payload);
      await Promise.all([people.reload(), unlisted.reload()]);
      setSaved({ kind: 'done', text: done });
      return true;
    } catch (error) {
      setSaved({ kind: 'error', text: adminErrorText(error) });
      return false;
    }
  };

  return (
    <>
      <AdminHead title="รายชื่อพนักงานและสิทธิ์">
        <p>คนที่นำเข้าเป็นพนักงานทั่วไป ตั้งสิทธิ์ ผู้ดูภาพรวม / ทีม GM / GM Admin และปิดบัญชีได้ที่นี่ — มีผลทันที</p>
      </AdminHead>
      <div className="gm-admin-sections">
        <div className="gm-admin-row-buttons">
          <Link className="gm-btn gm-btn--secondary" to={PEOPLE_IMPORT_PATH}>
            นำเข้ารายชื่อจาก CSV
          </Link>
        </div>
        <SaveLine saved={saved} />
        {unlisted.state.kind === 'ready' && unlisted.state.data.items.length > 0 && (
          <section className="gm-admin-panel gm-admin-stack" aria-labelledby="unlisted-heading">
            <h2 id="unlisted-heading">คนที่เข้าสู่ระบบแต่ไม่อยู่ในรายชื่อ</h2>
            <p className="gm-admin-muted">เห็นเฉพาะ GM Admin — ตรวจว่าเป็นพนักงานจริงก่อนเพิ่ม เพิ่มแล้วเข้าใช้งานได้ทันทีโดยไม่ต้อง login ใหม่</p>
            <ul className="gm-admin-cards" data-testid="unlisted-logins">
              {unlisted.state.data.items.map((entry) => (
                <UnlistedEntry key={entry.email} entry={entry} run={run} />
              ))}
            </ul>
          </section>
        )}
        <section className="gm-admin-stack" aria-labelledby="people-heading">
          <h2 id="people-heading">รายชื่อ</h2>
          <form
            className="gm-admin-add-form"
            role="search"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              setLimit(0);
              setSearch(query);
            }}
          >
            <label className="gm-field">
              <span>ค้นชื่อหรืออีเมล</span>
              <input
                className="gm-input"
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setLimit(0);
                  setSearch(event.target.value);
                }}
              />
            </label>
          </form>
          {people.state.kind === 'loading' && <Loading what="กำลังโหลดรายชื่อ…" />}
          {people.state.kind === 'failed' && <LoadFailed onRetry={() => void people.reload()} />}
          {people.state.kind === 'ready' && (
            <>
              <p className="gm-admin-muted">{`${people.state.data.total} คน`}</p>
              <PeopleList people={people.state.data.people} imported={people.state.data.imported} run={run} />
              {people.state.data.more && (
                <div>
                  <button type="button" className="gm-btn gm-btn--secondary" onClick={() => setLimit((current) => current + 50)}>
                    ดูเพิ่ม
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}
