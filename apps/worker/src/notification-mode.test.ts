import { describe, expect, it } from 'vitest';
import { resolveNotificationMode, resolveWebBaseUrl } from './notification-mode';

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

describe('resolveWebBaseUrl (A07: the link in every message; the real domain waits for P7-INFRA-01)', () => {
  it('defaults to the local dev web', () => {
    expect(resolveWebBaseUrl(undefined)).toBe('http://localhost:5173');
  });

  it.each([
    ['https://gm-dev.example.test', 'https://gm-dev.example.test'],
    ['https://gm-dev.example.test/', 'https://gm-dev.example.test'],
    ['https://example.test/gm/', 'https://example.test/gm'],
    ['http://127.0.0.1:5173', 'http://127.0.0.1:5173'],
  ])('accepts %s', (value, expected) => {
    expect(resolveWebBaseUrl(value)).toBe(expected);
  });

  it.each(['', 'gm.example.test', 'ftp://gm.example.test', 'http://gm.example.test', 'https://user:secret@gm.example.test', 'https://gm.example.test/?a=1', 'https://gm.example.test/#x'])(
    'refuses %j (https only, plain http only on this machine; no credentials, query or fragment)',
    (value) => {
      expect(() => resolveWebBaseUrl(value)).toThrow('GM_WEB_BASE_URL');
    },
  );
});
