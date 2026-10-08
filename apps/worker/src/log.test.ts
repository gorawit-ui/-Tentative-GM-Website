// A02 — the worker log (Part 6 §6.13: structured, redacted; CLAUDE.md: no employee data). Only
// allowlisted fields with opaque IDs, words and counts; e-mails, names, Slack IDs and free text
// have no field to go into and are redacted if forced into one.
import { describe, expect, it, vi } from 'vitest';
import { consoleWorkerLogger, type WorkerLogFields } from './log';

function lineOf(fields: WorkerLogFields, event = 'outbox.sent'): Record<string, unknown> {
  const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  consoleWorkerLogger.info(event, fields);
  const [first] = info.mock.calls[0] ?? [];
  return JSON.parse(String(first)) as Record<string, unknown>;
}

describe('consoleWorkerLogger', () => {
  it('one JSON line with the allowlisted fields', () => {
    expect(
      lineOf({ step: 'outbox_recovery', kind: 'request_created', state: 'provider_accepted', channel: 'email', code: 'NO_CHANNEL', outbox_id: 'a'.repeat(40), job_id: 'job-1', request_id: 'req-1', count: 3, attempts: 2 }),
    ).toEqual({
      event: 'outbox.sent',
      step: 'outbox_recovery',
      kind: 'request_created',
      state: 'provider_accepted',
      channel: 'email',
      code: 'NO_CHANNEL',
      outbox_id: 'a'.repeat(40),
      job_id: 'job-1',
      request_id: 'req-1',
      count: 3,
      attempts: 2,
    });
  });

  it.each([
    ['an e-mail as an ID', { outbox_id: 'employee01@tdfb.co' }, 'outbox_id'],
    ['a Thai name as a code', { code: 'คุณพนักงาน เอ' }, 'code'],
    ['free text as a kind', { kind: 'internet down at desk 4' }, 'kind'],
    ['an e-mail as a request ID', { request_id: 'a.b@tdfb.co' }, 'request_id'],
  ] as const)('redacts %s', (_label, fields, key) => {
    expect(lineOf(fields)[key]).toBe('redacted');
  });

  it('drops fields that are not on the list and non-integer counts', () => {
    const line = lineOf({ recipient_id: 'employee01@tdfb.co', count: 1.5 } as unknown as WorkerLogFields);
    expect(line).toEqual({ event: 'outbox.sent' });
  });

  it('an invalid event name is replaced', () => {
    expect(lineOf({}, 'sent to employee01@tdfb.co').event).toBe('invalid_event');
  });
});
