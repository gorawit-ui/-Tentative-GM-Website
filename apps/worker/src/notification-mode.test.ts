import { describe, expect, it } from 'vitest';
import { resolveNotificationMode } from './notification-mode';

describe('resolveNotificationMode', () => {
  it('defaults to the local (log-only) adapter', () => {
    expect(resolveNotificationMode(undefined)).toBe('local');
  });

  it.each(['local', 'disabled'] as const)('accepts %s', (mode) => {
    expect(resolveNotificationMode(mode)).toBe(mode);
  });

  it.each(['slack', 'gmail', 'email', '', 'LOCAL'])('refuses %j until a real, approved adapter exists', (value) => {
    expect(() => resolveNotificationMode(value)).toThrow('GM_NOTIFICATION_ADAPTER must be one of: local, disabled');
  });
});
