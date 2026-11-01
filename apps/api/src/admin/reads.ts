// A11 — what the Admin pages read (GM Admin only; the caller checks the role first). Bounded reads,
// once per page open (no listeners): the places with their QR codes, the company calendar with the
// reminder time, and the system health as counts and codes — never who a notice was for (FU-25).
import type { AdminCalendarView, AdminHealthView, AdminPlacesView } from '@gm/contracts';
import {
  DEFAULT_WORKING_MORNING_TIME,
  REQUEST_TYPES,
  ROLES,
  SLACK_FALLBACK_CODES,
  companyCalendarContentOf,
  defaultOwnerIssue,
  systemHealth,
  type DefaultOwnerProblem,
  type FailedJob,
  type Role,
} from '@gm/domain';
import { isLocalTimeOfDay } from '@gm/time';
import { Timestamp, type Query } from 'firebase-admin/firestore';
import type { ApiDeps } from '../endpoints/deps';
import { fromStored } from '../firestore/admin-store';
import { COMPANY_CALENDAR_PATH, NOTIFICATION_SETTINGS_PATH } from './commands';

/** Upper bounds of one page's reads (D-S10-4 spirit: no unbounded collection read). */
export const MAX_ADMIN_LOCATIONS = 50;
export const MAX_ADMIN_AREAS = 1000;
export const MAX_ADMIN_QR_CODES = 1000;
export const MAX_FAILED_JOBS_SHOWN = 20;
/** D-A11-6: notices counted on the health page are those of the last 7 days. */
export const HEALTH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const orderOf = (data: Readonly<Record<string, unknown>>) => (typeof data.order === 'number' ? data.order : Number.MAX_SAFE_INTEGER);
const labelOf = (data: Readonly<Record<string, unknown>>) => String(data.label ?? '');

export async function readPlaces(api: Pick<ApiDeps, 'db'>): Promise<AdminPlacesView> {
  const [locations, areas, qrCodes] = await Promise.all([
    api.db.collection('locations').limit(MAX_ADMIN_LOCATIONS).get(),
    api.db.collection('areas').limit(MAX_ADMIN_AREAS).get(),
    api.db.collection('qr_codes').limit(MAX_ADMIN_QR_CODES).get(),
  ]);
  const locationRows = locations.docs
    .map((doc) => ({ id: doc.id, data: fromStored(doc.data()) }))
    .sort((a, b) => orderOf(a.data) - orderOf(b.data) || labelOf(a.data).localeCompare(labelOf(b.data), 'th'));
  const position = new Map(locationRows.map((row, index) => [row.id, index]));
  const areaRows = areas.docs
    .map((doc) => ({ id: doc.id, data: fromStored(doc.data()) }))
    .sort(
      (a, b) =>
        (position.get(String(a.data.location_id)) ?? Number.MAX_SAFE_INTEGER) - (position.get(String(b.data.location_id)) ?? Number.MAX_SAFE_INTEGER) ||
        orderOf(a.data) - orderOf(b.data) ||
        labelOf(a.data).localeCompare(labelOf(b.data), 'th'),
    );
  return {
    locations: locationRows.map(({ id, data }) => {
      const own = areaRows.filter((area) => area.data.location_id === id);
      return {
        id,
        label: labelOf(data),
        active: data.active !== false,
        area_count: own.length,
        active_area_count: own.filter((area) => area.data.active !== false).length,
      };
    }),
    areas: areaRows.map(({ id, data }) => ({
      id,
      location_id: String(data.location_id ?? ''),
      label: labelOf(data),
      active: data.active !== false,
      ...(typeof data.qr_id === 'string' ? { qr_id: data.qr_id } : {}),
    })),
    qr_codes: qrCodes.docs.map((doc) => {
      const data = fromStored(doc.data());
      return { id: doc.id, location_id: String(data.location_id ?? ''), area_id: String(data.area_id ?? ''), active: data.active !== false };
    }),
  };
}

export async function readCalendar(api: Pick<ApiDeps, 'db'>): Promise<AdminCalendarView> {
  const [calendar, settings] = await Promise.all([api.db.doc(COMPANY_CALENDAR_PATH).get(), api.db.doc(NOTIFICATION_SETTINGS_PATH).get()]);
  const content = companyCalendarContentOf(calendar.exists ? calendar.data() : undefined);
  const time = settings.exists ? settings.data()?.working_morning_time : undefined;
  const custom = isLocalTimeOfDay(time);
  const revision = calendar.data()?.revision;
  return {
    configured: calendar.exists,
    ...(calendar.exists && typeof revision === 'number' ? { revision } : {}),
    timezone: content.timezone,
    open_weekdays: [...content.openWeekdays],
    holidays: content.holidays.map((date) => ({ date, ...(content.holidayNames[date] === undefined ? {} : { name: content.holidayNames[date] }) })),
    working_morning_time: custom ? (time as string) : DEFAULT_WORKING_MORNING_TIME,
    working_morning_time_is_default: !custom,
  };
}

const countOf = async (query: Query) => (await query.count().get()).data().count;

/** D-A10-1: each configured default owner that is not an active GM (by the role in people). */
async function defaultOwnerProblems(db: ApiDeps['db']): Promise<DefaultOwnerProblem[]> {
  const owners = ((await db.doc('settings/routing').get()).data()?.default_owner_by_type ?? {}) as Record<string, unknown>;
  const problems: DefaultOwnerProblem[] = [];
  for (const type of REQUEST_TYPES) {
    const ownerId = owners[type];
    if (type === 'gm_task' || typeof ownerId !== 'string' || ownerId === '') continue;
    const person = (await db.doc(`people/${ownerId}`).get()).data();
    const role = (ROLES as readonly string[]).includes(String(person?.role)) ? (person?.role as Role) : 'requester';
    const code = defaultOwnerIssue(person === undefined ? undefined : { personId: ownerId, role, active: person.active === true });
    if (code !== undefined) problems.push({ type, code });
  }
  return problems;
}

export async function readHealth(api: Pick<ApiDeps, 'db' | 'now'>): Promise<AdminHealthView> {
  const { db } = api;
  const now = api.now();
  const outbox = db.collection('outbox');
  const failedJobsQuery = db.collection('scheduled_work').where('state', '==', 'failed');
  // D-A11-6: what went wrong in the last 7 days (by the time of the attempt that settled it); the
  // e-mail cap queue is what waits now, so it is counted whole.
  const since = now - HEALTH_WINDOW_MS;
  const recent = (query: Query) => query.where('next_attempt_at', '>=', Timestamp.fromMillis(since));
  const [tick, slackApp, failed, deliveryUnknown, emailCapPending, fallbackCounts, failedJobs, failedJobCount, defaultOwnerIssues] = await Promise.all([
    db.doc('scheduled_work/tick').get(),
    db.doc('integration_state/slack_app').get(),
    countOf(recent(outbox.where('state', '==', 'failed'))),
    countOf(recent(outbox.where('state', '==', 'delivery_unknown'))),
    countOf(outbox.where('state', '==', 'pending').where('last_error_code', '==', 'EMAIL_CAP_REACHED')),
    Promise.all(SLACK_FALLBACK_CODES.map(async (code) => [code, await countOf(recent(outbox.where('slack_fallback_code', '==', code)))] as const)),
    failedJobsQuery.limit(MAX_FAILED_JOBS_SHOWN).get(),
    countOf(failedJobsQuery),
    defaultOwnerProblems(db),
  ]);
  const slackFallback: Record<string, number> = {};
  for (const [code, count] of fallbackCounts) if (count > 0) slackFallback[code] = count;
  const jobs: FailedJob[] = failedJobs.docs.map((doc) => {
    const data = fromStored(doc.data());
    const at = typeof data.last_attempt_at === 'number' ? data.last_attempt_at : typeof data.next_run_at === 'number' ? data.next_run_at : undefined;
    return { id: doc.id, kind: String(data.kind ?? ''), ...(typeof data.last_error_code === 'string' ? { code: data.last_error_code } : {}), ...(at === undefined ? {} : { at }) };
  });
  const health = systemHealth({
    now,
    tick: tick.exists ? fromStored(tick.data() ?? {}) : undefined,
    slackApp: slackApp.exists ? fromStored(slackApp.data() ?? {}) : undefined,
    outbox: { failed, deliveryUnknown, emailCapPending },
    slackFallback,
    failedJobs: jobs,
    failedJobCount,
    defaultOwnerIssues,
  });
  const tickBody: AdminHealthView['tick'] =
    health.tick.level === 'ok'
      ? { level: 'ok', ...(health.tick.lastStartedAt === undefined ? {} : { last_started_at: health.tick.lastStartedAt }), last_completed_at: health.tick.lastCompletedAt }
      : {
          level: 'red',
          reason: health.tick.reason,
          ...(health.tick.lastStartedAt === undefined ? {} : { last_started_at: health.tick.lastStartedAt }),
          ...(health.tick.lastCompletedAt === undefined ? {} : { last_completed_at: health.tick.lastCompletedAt }),
        };
  return {
    level: health.level,
    checked_at: now,
    tick: tickBody,
    slack_app: health.slackApp,
    outbox: { failed, delivery_unknown: deliveryUnknown, email_cap_pending: emailCapPending },
    slack_fallback: health.slackFallback,
    failed_jobs: health.failedJobs,
    failed_job_count: health.failedJobCount,
    default_owner_issues: health.defaultOwnerIssues,
  };
}
