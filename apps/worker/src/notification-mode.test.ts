import { describe, expect, it } from 'vitest';
import { resolveNotificationMode, resolveSandboxRecipients, resolveWebBaseUrl, resolveWorkerEnvironment } from './notification-mode';

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

describe('resolveWorkerEnvironment (the same GM_ENVIRONMENT as the API)', () => {
  it('defaults to local; accepts prod, dev, local; refuses anything else', () => {
    expect(resolveWorkerEnvironment(undefined)).toBe('local');
    for (const value of ['prod', 'dev', 'local'] as const) expect(resolveWorkerEnvironment(value)).toBe(value);
    for (const value of ['', 'staging', 'PROD']) expect(() => resolveWorkerEnvironment(value)).toThrow('GM_ENVIRONMENT must be prod, dev or local');
  });
});

describe('resolveSandboxRecipients (D-A07-8: dev sends only to approved Slack IDs and e-mails; prod has no list)', () => {
  it('prod: no list at all — setting one is refused at start-up', () => {
    expect(resolveSandboxRecipients('prod', undefined)).toBeUndefined();
    expect(() => resolveSandboxRecipients('prod', 'U0ABC12345')).toThrow('GM_NOTIFY_SANDBOX must not be set in prod');
    expect(() => resolveSandboxRecipients('prod', '')).toThrow('GM_NOTIFY_SANDBOX must not be set in prod');
  });

  it('dev and local: no list means nobody (fail closed)', () => {
    for (const environment of ['dev', 'local'] as const) {
      expect(resolveSandboxRecipients(environment, undefined)).toEqual({ slackUserIds: new Set(), emails: new Set() });
      expect(resolveSandboxRecipients(environment, ' ')).toEqual({ slackUserIds: new Set(), emails: new Set() });
    }
  });

  it('comma-separated Slack user IDs and company e-mails; e-mails compared in lowercase', () => {
    expect(resolveSandboxRecipients('dev', ' U0ABC12345 , gm.one@tdfb.co,GM.Two@TDFB.CO ,W0XYZ98765')).toEqual({
      slackUserIds: new Set(['U0ABC12345', 'W0XYZ98765']),
      emails: new Set(['gm.one@tdfb.co', 'gm.two@tdfb.co']),
    });
  });

  it.each(['someone@gmail.com', 'gm.one@tdfb.co.th', 'not-an-id', 'u0abc12345', 'gm one@tdfb.co'])('refuses %j (only Slack user IDs and @tdfb.co e-mails)', (entry) => {
    expect(() => resolveSandboxRecipients('dev', `U0ABC12345,${entry}`)).toThrow('GM_NOTIFY_SANDBOX');
  });
});
