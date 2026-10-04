// @gm/contracts — schemas shared by web, API and worker (Part 6 §6.3).
// S00 only defines the health-check shape so every workspace proves it can import a shared package.

export const SERVICE_NAMES = ['gm-api', 'gm-worker'] as const;
export type ServiceName = (typeof SERVICE_NAMES)[number];

export interface HealthResponse {
  readonly status: 'ok';
  readonly service: ServiceName;
}

export function healthResponse(service: ServiceName): HealthResponse {
  return { status: 'ok', service };
}
