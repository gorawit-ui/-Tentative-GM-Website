// @gm/contracts — schemas shared by web, API and worker (Part 6 §6.3).
// Health response from S00; persisted calendar snapshot and SLA unit contracts added in S02.

export const SERVICE_NAMES = ['gm-api', 'gm-worker'] as const;
export type ServiceName = (typeof SERVICE_NAMES)[number];

export interface HealthResponse {
  readonly status: 'ok';
  readonly service: ServiceName;
}

export function healthResponse(service: ServiceName): HealthResponse {
  return { status: 'ok', service };
}
export {
  canonicalCalendarSnapshotJson,
  type CalendarSnapshotContent,
  type CalendarSnapshotDocument,
  type SlaDurationUnit,
} from './calendar';
