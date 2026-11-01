// A11 — สุขภาพระบบ (FU-25): the last tick (red when the last finished tick is over 30 minutes old or
// none finished, D-A02-5), the Slack app (D-A08-6: down → every Slack message goes by e-mail), failed
// scheduled jobs (D-A05-5) and notices not delivered. Each state is said in words with its level, never
// colour alone; counts and codes only — the API never sends who a notice was for. Read on open and on
// “ตรวจอีกครั้ง” (no listener).
import type { ReactNode } from 'react';
import type { AdminHealthView } from '@gm/contracts';
import { formatThaiDateTime } from '@gm/time';
import { getHealth } from './api';
import { AdminHead, LoadFailed, Loading, useAdminData } from './common';

/** D-A10-1: request types and why their default owner cannot take new requests. */
const REQUEST_TYPE_LABELS: Readonly<Record<string, string>> = { maintenance: 'แจ้งซ่อม', document_request: 'ขอเอกสาร', document_intake: 'ส่งเอกสาร' };
const OWNER_ISSUE_LABELS: Readonly<Record<string, string>> = {
  DEFAULT_OWNER_NOT_GM: 'ไม่ได้เป็นทีม GM แล้ว',
  DEFAULT_OWNER_INACTIVE: 'ถูกปิดบัญชี',
  DEFAULT_OWNER_NOT_LISTED: 'ไม่อยู่ในรายชื่อพนักงาน',
};

const LEVEL_TEXT: Readonly<Record<AdminHealthView['level'], string>> = { ok: 'ปกติ', warning: 'ควรตรวจ', red: 'ต้องแก้ไข' };

/** What the Admin can do about each fallback reason. */
const FALLBACK_HINTS: Readonly<Record<string, string>> = {
  SLACK_NOT_MAPPED: 'Slack ID ที่เก็บไว้ไม่ตรง ให้แก้ในรายชื่อพนักงาน',
  SLACK_USER_NOT_FOUND: 'ไม่พบผู้ใช้ Slack นี้ ให้แก้ในรายชื่อพนักงาน',
  SLACK_CHANNEL_NOT_FOUND: 'ไม่พบช่องทาง Slack ของผู้ใช้นี้',
  SLACK_USER_DISABLED: 'ผู้ใช้ Slack ถูกปิด',
  OTHER: 'เหตุผลอื่น',
};

function Card({ testId, level, title, children }: { readonly testId: string; readonly level: AdminHealthView['level']; readonly title: string; readonly children: ReactNode }) {
  return (
    <section className={`gm-admin-panel gm-health-card gm-health-card--${level}`} data-testid={testId} data-level={level} aria-labelledby={`${testId}-heading`}>
      <div className="gm-admin-card-head">
        <h2 id={`${testId}-heading`}>{title}</h2>
        <span className={`gm-badge gm-badge--${level === 'ok' ? 'ok' : level === 'warning' ? 'warning' : 'danger'}`}>{LEVEL_TEXT[level]}</span>
      </div>
      {children}
    </section>
  );
}

function TickText({ tick }: { readonly tick: AdminHealthView['tick'] }) {
  if (tick.level === 'ok') return <p>{`ทำงานเสร็จล่าสุด ${formatThaiDateTime(tick.last_completed_at)} (ภายใน 30 นาที)`}</p>;
  if (tick.reason === 'TICK_NEVER_COMPLETED') {
    return <p>{`ยังไม่มีรอบที่ทำงานเสร็จ${tick.last_started_at === undefined ? '' : ` — เริ่มล่าสุด ${formatThaiDateTime(tick.last_started_at)}`} งานตามเวลา (งานค้าง ปิดอัตโนมัติ การเตือน) จะไม่เดิน`}</p>;
  }
  return <p>{`ไม่ได้ทำงานเกิน 30 นาที — ทำงานเสร็จล่าสุด ${tick.last_completed_at === undefined ? '-' : formatThaiDateTime(tick.last_completed_at)} ตรวจ Cloud Scheduler และ worker`}</p>;
}

function HealthBody({ health, onRetry }: { readonly health: AdminHealthView; readonly onRetry: () => void }) {
  const fallback = Object.entries(health.slack_fallback);
  const outboxLevel = health.outbox.failed + health.outbox.delivery_unknown + health.outbox.email_cap_pending > 0 ? 'warning' : 'ok';
  return (
    <div className="gm-admin-sections">
      <div className={`gm-health-summary gm-health-summary--${health.level}`} data-testid="health-summary" role="status">
        <strong>{`สถานะรวม: ${LEVEL_TEXT[health.level]}`}</strong>
        <span>{`ตรวจเมื่อ ${formatThaiDateTime(health.checked_at)}`}</span>
        <button type="button" className="gm-btn gm-btn--secondary" onClick={onRetry}>
          ตรวจอีกครั้ง
        </button>
      </div>
      <div className="gm-health-grid">
        <Card testId="health-tick" level={health.tick.level} title="รอบงานอัตโนมัติ (tick ทุก 15 นาที)">
          <TickText tick={health.tick} />
        </Card>
        <Card testId="health-slack" level={health.slack_app.level} title="แอป Slack">
          {health.slack_app.level === 'ok' ? (
            <p>ส่งข้อความทาง Slack ได้ตามปกติ</p>
          ) : (
            <p>{`แอป Slack ใช้ไม่ได้ (${health.slack_app.code})${health.slack_app.since === undefined ? '' : ` ตั้งแต่ ${formatThaiDateTime(health.slack_app.since)}`} — ข้อความ Slack ทั้งหมดส่งทางอีเมลแทนอยู่ จนกว่า Slack จะส่งสำเร็จอีกครั้ง`}</p>
          )}
        </Card>
        <Card testId="health-jobs" level={health.failed_job_count > 0 ? 'red' : 'ok'} title="งานตามเวลาที่ล้มเหลว">
          {health.failed_job_count === 0 ? (
            <p>ไม่มี</p>
          ) : (
            <>
              <p>{`ล้มเหลว ${health.failed_job_count} งาน — ค้างไว้ให้ตรวจ งานรายวันของวันถัดไปยังถูกสร้างตามปกติ`}</p>
              <ul className="gm-health-list">
                {health.failed_jobs.map((job) => (
                  <li key={job.id}>
                    <span className="font-semibold">{job.id}</span>
                    <span className="gm-admin-muted">{[job.code, job.at === undefined ? undefined : formatThaiDateTime(job.at)].filter(Boolean).join(' · ')}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
        <Card testId="health-owners" level={health.default_owner_issues.length > 0 ? 'warning' : 'ok'} title="ผู้รับผิดชอบเริ่มต้น">
          {health.default_owner_issues.length === 0 ? (
            <p>ผู้รับผิดชอบเริ่มต้นทุกประเภทเป็นทีม GM ที่ใช้งานอยู่</p>
          ) : (
            <>
              <p>งานใหม่ของประเภทเหล่านี้จะ “ยังไม่มอบหมาย” และแจ้ง GM ทุกคน จนกว่าจะตั้งผู้รับผิดชอบเริ่มต้นใหม่</p>
              <ul className="gm-health-list">
                {health.default_owner_issues.map((issue) => (
                  <li key={issue.type}>{`${REQUEST_TYPE_LABELS[issue.type] ?? issue.type}: ผู้รับผิดชอบเริ่มต้น${OWNER_ISSUE_LABELS[issue.code] ?? issue.code}`}</li>
                ))}
              </ul>
            </>
          )}
        </Card>
        <Card testId="health-outbox" level={outboxLevel} title="การแจ้งเตือน">
          <ul className="gm-health-list">
            <li>{`ส่งไม่สำเร็จ ${health.outbox.failed}`}</li>
            <li>{`ไม่แน่ใจว่าส่งถึง ${health.outbox.delivery_unknown}`}</li>
            <li>{`ค้างเพราะเพดานอีเมล ${health.outbox.email_cap_pending}`}</li>
          </ul>
          <p className="gm-admin-muted">ส่งทางอีเมลแทน Slack</p>
          {fallback.length === 0 ? (
            <p>ไม่มี</p>
          ) : (
            <ul className="gm-health-list">
              {fallback.map(([code, count]) => (
                <li key={code}>{`${code} ${count}${FALLBACK_HINTS[code] === undefined ? '' : ` — ${FALLBACK_HINTS[code]}`}`}</li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

export function HealthPage() {
  const { state, reload } = useAdminData(getHealth);
  return (
    <>
      <AdminHead title="สุขภาพระบบ">
        <p>ตรวจว่างานอัตโนมัติและการแจ้งเตือนทำงานอยู่ — แสดงเป็นจำนวนและรหัส ไม่มีชื่อหรือรายละเอียดงาน</p>
      </AdminHead>
      {state.kind === 'loading' && <Loading what="กำลังตรวจสถานะ…" />}
      {state.kind === 'failed' && <LoadFailed onRetry={() => void reload()} />}
      {state.kind === 'ready' && <HealthBody health={state.data} onRetry={() => void reload()} />}
    </>
  );
}
