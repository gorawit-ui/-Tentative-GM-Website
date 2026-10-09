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
