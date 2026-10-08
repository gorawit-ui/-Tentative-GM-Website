// A02 — the worker log (Part 6 §6.13: structured, redact secrets/bodies; CLAUDE.md: no employee
// data). Events carry an allowlisted set of fields holding opaque IDs, code words and counts only;
// recipients (person IDs are e-mails), names, Slack IDs, request numbers and error text have no field.
export interface WorkerLogFields {
  /** Tick step, e.g. `outbox_recovery`. */
  readonly step?: string;
  /** Event or job kind, e.g. `request_created`, `cleanup`. */
  readonly kind?: string;
  readonly state?: string;
  readonly channel?: string;
  readonly code?: string;
  readonly outbox_id?: string;
  readonly job_id?: string;
  readonly request_id?: string;
  readonly count?: number;
  readonly attempts?: number;
}

export interface WorkerLogger {
  info(event: string, fields?: WorkerLogFields): void;
  warn(event: string, fields?: WorkerLogFields): void;
}

const EVENT = /^[a-z][a-z0-9_.]{0,63}$/;
const WORD = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const OPAQUE = /^[A-Za-z0-9_-]{1,128}$/;
const WORD_FIELDS = ['step', 'kind', 'state', 'channel', 'code'] as const;
const ID_FIELDS = ['outbox_id', 'job_id', 'request_id'] as const;
const NUMBER_FIELDS = ['count', 'attempts'] as const;

function safe(event: string, fields: WorkerLogFields = {}): Record<string, string | number> {
  const line: Record<string, string | number> = { event: EVENT.test(event) ? event : 'invalid_event' };
  for (const key of WORD_FIELDS) {
    const value = fields[key];
    if (value !== undefined) line[key] = WORD.test(value) ? value : 'redacted';
  }
  for (const key of ID_FIELDS) {
    const value = fields[key];
    if (value !== undefined) line[key] = OPAQUE.test(value) ? value : 'redacted';
  }
  for (const key of NUMBER_FIELDS) {
    const value = fields[key];
    if (value !== undefined && Number.isSafeInteger(value)) line[key] = value;
  }
  return line;
}

/** Structured one-line JSON on stdout/stderr (Cloud Run collects both). */
export const consoleWorkerLogger: WorkerLogger = {
  info: (event, fields) => console.info(JSON.stringify(safe(event, fields))),
  warn: (event, fields) => console.warn(JSON.stringify(safe(event, fields))),
};
