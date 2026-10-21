// A11 — what the Admin API answers (`GET /api/admin/places|calendar|health`), shared by the API and the
// Admin pages. Counts and codes only on the health page: never who a notice was for (FU-25).
import type { Instant } from '@gm/time';

export interface AdminLocationView {
  readonly id: string;
  readonly label: string;
  readonly active: boolean;
  readonly area_count: number;
  readonly active_area_count: number;
}

export interface AdminAreaView {
  readonly id: string;
  readonly location_id: string;
  readonly label: string;
  readonly active: boolean;
  readonly qr_id?: string;
}

export interface AdminQrView {
  readonly id: string;
  readonly location_id: string;
  readonly area_id: string;
  readonly active: boolean;
}

export interface AdminPlacesView {
  readonly locations: readonly AdminLocationView[];
  readonly areas: readonly AdminAreaView[];
  readonly qr_codes: readonly AdminQrView[];
}

export interface AdminCalendarView {
  /** false → `calendars/company` is missing: new requests are refused (CALENDAR_NOT_CONFIGURED). */
  readonly configured: boolean;
  readonly revision?: number;
  readonly timezone: string;
  readonly open_weekdays: readonly number[];
  /** ค.ศ. `YYYY-MM-DD`, sorted. */
  readonly holidays: readonly { readonly date: string; readonly name?: string }[];
  readonly working_morning_time: string;
  readonly working_morning_time_is_default: boolean;
}

export type AdminTickView =
  | { readonly level: 'ok'; readonly last_started_at?: Instant; readonly last_completed_at: Instant }
  | { readonly level: 'red'; readonly reason: 'TICK_LATE' | 'TICK_NEVER_COMPLETED'; readonly last_started_at?: Instant; readonly last_completed_at?: Instant };

export interface AdminHealthView {
  readonly level: 'ok' | 'warning' | 'red';
  readonly checked_at: Instant;
  readonly tick: AdminTickView;
  readonly slack_app: { readonly level: 'ok' } | { readonly level: 'red'; readonly code: string; readonly since?: Instant };
  readonly outbox: { readonly failed: number; readonly delivery_unknown: number; readonly email_cap_pending: number };
  readonly slack_fallback: Readonly<Record<string, number>>;
  readonly failed_jobs: readonly { readonly id: string; readonly kind: string; readonly code?: string; readonly at?: Instant }[];
  readonly failed_job_count: number;
}
