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
