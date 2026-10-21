// A11 — the Admin system health (FU-25, D-A02-5, D-A05-5, D-A08-6): the last tick (red when the last
// finished tick is more than 30 minutes old), Slack app errors, failed jobs and undelivered notices.
// Every red/warning item has words, not colour alone (the page shows `reason`).
import { describe, expect, it } from 'vitest';
import { TICK_STALE_AFTER_MS, systemHealth, tickHealth, type HealthFacts } from './index';

const NOW = Date.parse('2027-01-11T09:00:00+07:00');
const MIN = 60_000;

describe('tickHealth', () => {
  it('30 minutes is the limit (D-A02-5)', () => {
    expect(TICK_STALE_AFTER_MS).toBe(30 * MIN);
  });

  it('the last finished tick within 30 minutes → ok', () => {
    expect(tickHealth({ last_started_at: NOW - 15 * MIN, last_completed_at: NOW - 15 * MIN + 2_000 }, NOW)).toEqual({
      level: 'ok',
      lastStartedAt: NOW - 15 * MIN,
      lastCompletedAt: NOW - 15 * MIN + 2_000,
    });
    expect(tickHealth({ last_completed_at: NOW - 30 * MIN }, NOW).level).toBe('ok');
  });

  it('more than 30 minutes ago → red, TICK_LATE', () => {
    expect(tickHealth({ last_started_at: NOW - 31 * MIN, last_completed_at: NOW - 30 * MIN - 1 }, NOW)).toEqual({
      level: 'red',
      reason: 'TICK_LATE',
      lastStartedAt: NOW - 31 * MIN,
      lastCompletedAt: NOW - 30 * MIN - 1,
    });
  });

  it('started recently but never finished → red (a tick that dies is not a healthy tick)', () => {
    expect(tickHealth({ last_started_at: NOW - MIN }, NOW)).toEqual({ level: 'red', reason: 'TICK_NEVER_COMPLETED', lastStartedAt: NOW - MIN });
  });

  it.each([undefined, null, {}, { last_completed_at: 'yesterday' }])('no tick record → red, TICK_NEVER_COMPLETED (%o)', (stored) => {
    expect(tickHealth(stored, NOW)).toEqual({ level: 'red', reason: 'TICK_NEVER_COMPLETED' });
  });
});

const healthy: HealthFacts = {
  now: NOW,
  tick: { last_started_at: NOW - 5 * MIN, last_completed_at: NOW - 5 * MIN },
  slackApp: { status: 'ok' },
  outbox: { failed: 0, deliveryUnknown: 0, emailCapPending: 0 },
  slackFallback: {},
  failedJobs: [],
  failedJobCount: 0,
};

describe('systemHealth', () => {
  it('all well → ok', () => {
    expect(systemHealth(healthy).level).toBe('ok');
  });

  it('late tick → red', () => {
    expect(systemHealth({ ...healthy, tick: { last_completed_at: NOW - 45 * MIN } }).level).toBe('red');
  });

  it('D-A08-6: the Slack app is down → red with its code and since when', () => {
    const health = systemHealth({ ...healthy, slackApp: { status: 'app_error', code: 'SLACK_INVALID_AUTH', since: NOW - 60 * MIN } });
    expect(health.level).toBe('red');
    expect(health.slackApp).toEqual({ level: 'red', code: 'SLACK_INVALID_AUTH', since: NOW - 60 * MIN });
  });

  it('D-A05-5: a failed job stays visible and counts → red', () => {
    const job = { id: 'presence_reset-2027-01-10', kind: 'presence_reset', code: 'INTERNAL', at: NOW - 600 * MIN };
    const health = systemHealth({ ...healthy, failedJobs: [job], failedJobCount: 1 });
    expect(health.level).toBe('red');
    expect(health.failedJobs).toEqual([job]);
  });

  it('notices not delivered (failed / delivery_unknown) or held by the e-mail cap → warning', () => {
    expect(systemHealth({ ...healthy, outbox: { failed: 2, deliveryUnknown: 0, emailCapPending: 0 } }).level).toBe('warning');
    expect(systemHealth({ ...healthy, outbox: { failed: 0, deliveryUnknown: 1, emailCapPending: 0 } }).level).toBe('warning');
    expect(systemHealth({ ...healthy, outbox: { failed: 0, deliveryUnknown: 0, emailCapPending: 3 } }).level).toBe('warning');
  });

  it('notices sent by e-mail instead of Slack are counted per reason, but alone they do not change the level', () => {
    const health = systemHealth({ ...healthy, slackFallback: { SLACK_NOT_MAPPED: 4, SLACK_USER_DISABLED: 1 } });
    expect(health.level).toBe('ok');
    expect(health.slackFallback).toEqual({ SLACK_NOT_MAPPED: 4, SLACK_USER_DISABLED: 1 });
  });

  it('red wins over warning', () => {
    expect(systemHealth({ ...healthy, tick: undefined, outbox: { failed: 2, deliveryUnknown: 0, emailCapPending: 0 } }).level).toBe('red');
  });
});
