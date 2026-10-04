// Self-check of the unit-test harness guarantees (BUILD-COMMANDS: test:unit is deterministic
// with a fake clock and does not depend on Firebase or the network).
import http from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { UNIT_TEST_FIXED_NOW, UNIT_TEST_TIME_ZONE } from './determinism';

describe('unit-test harness', () => {
  it('runs in the fixed non-Bangkok time zone, whatever the machine uses', () => {
    expect(process.env.TZ).toBe(UNIT_TEST_TIME_ZONE);
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(UNIT_TEST_TIME_ZONE);
    // 2 Oct 2026 is daylight time in New York: UTC-4.
    expect(new Date(UNIT_TEST_FIXED_NOW).getTimezoneOffset()).toBe(240);
  });

  it('freezes Date at the fixed instant by default', () => {
    expect(Date.now()).toBe(Date.parse(UNIT_TEST_FIXED_NOW));
    expect(new Date().toISOString()).toBe(UNIT_TEST_FIXED_NOW);
  });

  it('lets a test move the clock explicitly', () => {
    vi.setSystemTime(new Date('2026-12-28T02:30:00.000Z'));
    expect(new Date().toISOString()).toBe('2026-12-28T02:30:00.000Z');
  });

  it('refuses fetch, sockets and DNS (including emulator ports)', async () => {
    await expect(fetch('http://127.0.0.1:8080/')).rejects.toThrow(/must not use the network/);
    expect(() => http.get('http://127.0.0.1:9099/')).toThrow(/must not use the network/);
    const dns = await import('node:dns');
    await expect(dns.promises.lookup('firestore.googleapis.com')).rejects.toThrow(/must not use the network/);
  });
});
