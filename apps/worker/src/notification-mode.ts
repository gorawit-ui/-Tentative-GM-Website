// Which outbound notification adapter the worker may use (BUILD-COMMANDS: dev uses a local
// notification adapter and never notifies real employees).
//
// Only `local` (log-only, nothing leaves the machine) and `disabled` exist. Slack and Gmail
// adapters arrive in A07/A08 and need P7-ADMIN-02/03 approval plus sandbox recipients; until
// then any other value stops the worker at startup instead of guessing.
export const NOTIFICATION_MODES = ['local', 'disabled'] as const;
export type NotificationMode = (typeof NOTIFICATION_MODES)[number];

function isNotificationMode(value: string): value is NotificationMode {
  return (NOTIFICATION_MODES as readonly string[]).includes(value);
}

export function resolveNotificationMode(value: string | undefined): NotificationMode {
  if (value === undefined) return 'local';
  if (isNotificationMode(value)) return value;
  throw new Error(`GM_NOTIFICATION_ADAPTER must be one of: ${NOTIFICATION_MODES.join(', ')}`);
}

/** A07: where the links in messages point until P7-INFRA-01 fixes the real domain (the Vite dev server). */
export const DEFAULT_WEB_BASE_URL = 'http://localhost:5173';
const LOCAL_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]']);
const WEB_BASE_URL_RULE = 'GM_WEB_BASE_URL must be an https URL (plain http only for localhost) without credentials, query or fragment';

/** `GM_WEB_BASE_URL`: the web origin (optionally with a path) every message links to; no trailing slash. */
export function resolveWebBaseUrl(value: string | undefined): string {
  if (value === undefined) return DEFAULT_WEB_BASE_URL;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(WEB_BASE_URL_RULE);
  }
  const secure = url.protocol === 'https:' || (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname));
  if (!secure || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '' || value.includes('?') || value.includes('#')) {
    throw new Error(WEB_BASE_URL_RULE);
  }
  return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
}

export const WORKER_ENVIRONMENTS = ['prod', 'dev', 'local'] as const;
export type WorkerEnvironment = (typeof WORKER_ENVIRONMENTS)[number];

/** `GM_ENVIRONMENT`, read like the API's (default `local`, the emulators). */
export function resolveWorkerEnvironment(value: string | undefined): WorkerEnvironment {
  const environment = value ?? 'local';
  if (!(WORKER_ENVIRONMENTS as readonly string[]).includes(environment)) throw new Error('GM_ENVIRONMENT must be prod, dev or local');
  return environment as WorkerEnvironment;
}

/** D-A07-8: who a dev / local worker may notify — approved Slack user IDs and company e-mails. */
export interface SandboxRecipients {
  readonly slackUserIds: ReadonlySet<string>;
  /** Lowercase. */
  readonly emails: ReadonlySet<string>;
}

const SLACK_USER_ID = /^[UW][A-Z0-9]{6,}$/;
const COMPANY_EMAIL = /^[a-z0-9._%+-]+@tdfb\.co$/;

/**
 * D-A07-8 `GM_NOTIFY_SANDBOX`: comma-separated Slack user IDs and @tdfb.co e-mails. prod has no list
 * (setting one stops the worker); dev and local without one notify nobody (fail closed).
 */
export function resolveSandboxRecipients(environment: WorkerEnvironment, value: string | undefined): SandboxRecipients | undefined {
  if (environment === 'prod') {
    if (value !== undefined) throw new Error('GM_NOTIFY_SANDBOX must not be set in prod (D-A07-8: prod has no sandbox list)');
    return undefined;
  }
  const slackUserIds = new Set<string>();
  const emails = new Set<string>();
  for (const raw of (value ?? '').split(',')) {
    const entry = raw.trim();
    if (entry === '') continue;
    if (SLACK_USER_ID.test(entry)) slackUserIds.add(entry);
    else if (COMPANY_EMAIL.test(entry.toLowerCase())) emails.add(entry.toLowerCase());
    else throw new Error('GM_NOTIFY_SANDBOX entries must be Slack user IDs or @tdfb.co e-mails');
  }
  return { slackUserIds, emails };
}
