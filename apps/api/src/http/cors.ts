// A01 — CORS allowlist (stub).
import type { DeploymentEnvironment } from '@gm/domain';

export function defaultAllowedOrigins(_environment: DeploymentEnvironment): readonly string[] {
  return [];
}

export function resolveAllowedOrigins(_environment: DeploymentEnvironment, _override: string | undefined): readonly string[] {
  throw new Error('NOT_IMPLEMENTED');
}

export function corsDecision(_origin: string | undefined, _allowed: readonly string[]): { readonly allowed: boolean; readonly headers: Readonly<Record<string, string>> } {
  throw new Error('NOT_IMPLEMENTED');
}
