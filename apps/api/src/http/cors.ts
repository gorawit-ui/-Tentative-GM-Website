// A01 — CORS allowlist. Part 6 §6.2: Hosting serves the SPA and rewrites /api/** to Cloud Run, so
// browser calls are normally same-origin; the allowlist covers direct calls to the API from the
// app's own origins only. The domains are proposals until P7-INFRA-01 (gm.tdfb.co / gm-dev.tdfb.co),
// so an exact override list can replace them. No wildcards, no credentials (bearer tokens only).
import type { DeploymentEnvironment } from '@gm/domain';

const DEFAULTS: Readonly<Record<DeploymentEnvironment, readonly string[]>> = {
  prod: ['https://gm.tdfb.co'],
  dev: ['https://gm-dev.tdfb.co'],
  // Vite dev server and preview (apps/web/vite.config.ts, strict ports).
  local: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173'],
};

export function defaultAllowedOrigins(environment: DeploymentEnvironment): readonly string[] {
  return DEFAULTS[environment];
}

/** One exact origin: scheme://host[:port], lower-case, no path; plain http only for local loopback. */
function checkOrigin(entry: string, environment: DeploymentEnvironment): string {
  let url: URL;
  try {
    url = new URL(entry);
  } catch {
    throw new RangeError('allowed origin must be an absolute URL');
  }
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  const schemeOk = url.protocol === 'https:' || (url.protocol === 'http:' && loopback && environment === 'local');
  if (!schemeOk || url.origin !== entry || entry.includes('*')) {
    throw new RangeError('allowed origin must be an exact https origin (http only for localhost in local)');
  }
  return entry;
}

/** `GM_ALLOWED_ORIGINS` (comma-separated) replaces the defaults; every entry is validated. */
export function resolveAllowedOrigins(environment: DeploymentEnvironment, override: string | undefined): readonly string[] {
  if (override === undefined || override.trim() === '') return defaultAllowedOrigins(environment);
  return override.split(',').map((entry) => checkOrigin(entry.trim(), environment));
}

/** Whether a request from `origin` may proceed, and the CORS headers to send back. */
export function corsDecision(origin: string | undefined, allowed: readonly string[]): { readonly allowed: boolean; readonly headers: Readonly<Record<string, string>> } {
  if (origin === undefined) return { allowed: true, headers: { vary: 'Origin' } };
  if (!allowed.includes(origin)) return { allowed: false, headers: { vary: 'Origin' } };
  return { allowed: true, headers: { 'access-control-allow-origin': origin, vary: 'Origin' } };
}
