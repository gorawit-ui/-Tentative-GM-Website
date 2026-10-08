// A02 — the worker's HTTP surface (Part 6 §6.2: IAM/OIDC only on Cloud Run, no public tick):
// health, the tick (Scheduler) and outbox tasks (Cloud Tasks). The real wiring runs on the emulator
// in tests/emulator/worker-tick.test.ts.
import { describe, expect, it } from 'vitest';
import { MAX_TASK_IDS, OUTBOX_TASK_PATH, TICK_PATH, parseOutboxTask } from './routes';

const id = (n: number) => n.toString(16).padStart(40, '0');

describe('paths', () => {
  it('one tick path and one task path', () => {
    expect(TICK_PATH).toBe('/internal/tick');
    expect(OUTBOX_TASK_PATH).toBe('/internal/tasks/outbox');
    expect(MAX_TASK_IDS).toBe(50);
  });
});

describe('parseOutboxTask', () => {
  it('a list of outbox IDs (hashes), duplicates removed', () => {
    expect(parseOutboxTask({ outbox_ids: [id(1), id(2), id(1)] })).toEqual([id(1), id(2)]);
  });

  it.each([
    ['not an object', 'x'],
    ['no list', {}],
    ['an empty list', { outbox_ids: [] }],
    ['too many IDs', { outbox_ids: Array.from({ length: 51 }, (_, n) => id(n)) }],
    ['an e-mail instead of an ID', { outbox_ids: ['employee01@tdfb.co'] }],
    ['a path', { outbox_ids: ['../requests/req-1'] }],
    ['an extra field', { outbox_ids: [id(1)], recipient_id: 'employee01@tdfb.co' }],
  ])('refuses %s', (_label, body) => {
    expect(() => parseOutboxTask(body)).toThrow();
  });
});
