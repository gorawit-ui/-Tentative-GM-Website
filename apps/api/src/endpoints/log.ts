// S12 — the API log (Part 6 §6.5: no confidential data in logs, error payloads or URLs). Events carry
// an allowlisted set of fields with opaque IDs and codes only; free text, e-mails, names, signed
// URLs and tokens have no field to go into.
export interface LogFields {
  readonly code?: string;
  readonly status?: number;
  readonly request_id?: string;
  readonly upload_id?: string;
  readonly count?: number;
}

export interface ApiLogger {
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
}

const EVENT = /^[a-z][a-z0-9_.]{0,63}$/;
const OPAQUE = /^[A-Za-z0-9_-]{1,128}$/;

function safe(event: string, fields: LogFields = {}): Record<string, string | number> {
  const line: Record<string, string | number> = { event: EVENT.test(event) ? event : 'invalid_event' };
  for (const key of ['code', 'request_id', 'upload_id'] as const) {
    const value = fields[key];
    if (value !== undefined) line[key] = OPAQUE.test(value) ? value : 'redacted';
  }
  for (const key of ['status', 'count'] as const) {
    const value = fields[key];
    if (value !== undefined && Number.isInteger(value)) line[key] = value;
  }
  return line;
}

/** Structured one-line JSON on stdout/stderr (Cloud Run collects both). */
export const consoleLogger: ApiLogger = {
  info: (event, fields) => console.info(JSON.stringify(safe(event, fields))),
  warn: (event, fields) => console.warn(JSON.stringify(safe(event, fields))),
};
