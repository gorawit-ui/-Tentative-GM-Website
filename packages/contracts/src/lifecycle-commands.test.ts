// A03 — lifecycle commands at the API boundary (Part 6 §6.6: accept / complete / confirm / notResolved /
// cancel / reopen). Every command on an existing request carries `expected_revision` (§6.6: a stale
// revision is refused, never silently overwritten); the requester's answers name the completion cycle.
import { describe, expect, it } from 'vitest';
import { ContractRejected, parseCommand } from './index';

const COMMAND_ID = '0b9d6c43-8a1e-4c55-9e0f-3f7f5f1a2b3c';
const body = (type: string, payload: Record<string, unknown>) => ({ command_id: COMMAND_ID, type, payload });

const VALID = [
  body('accept_request', { request_id: 'req-1', expected_revision: 1 }),
  body('accept_request', { request_id: 'req-1', expected_revision: 3, take_over: true }),
  body('complete_request', { request_id: 'req-1', expected_revision: 2, resolution_summary: 'เปลี่ยนสายแลนแล้ว ใช้งานได้' }),
  body('confirm_completion', { request_id: 'req-1', expected_revision: 3, completion_cycle_id: 1 }),
  body('report_not_resolved', { request_id: 'req-1', expected_revision: 3, completion_cycle_id: 1, reason: 'ยังหลุดอยู่' }),
  body('cancel_request', { request_id: 'req-1', expected_revision: 1, reason: 'แจ้งซ้ำ' }),
  body('reopen_request', { request_id: 'req-1', expected_revision: 4, reason: 'พบปัญหาเดิม' }),
];

describe('lifecycle commands parse into fresh typed objects', () => {
  it.each(VALID.map((command) => [command.type, command] as const))('%s', (_type, command) => {
    expect(parseCommand(JSON.parse(JSON.stringify(command)))).toEqual(command);
  });
});

describe('expected_revision is required and is a positive whole number', () => {
  it.each(['accept_request', 'complete_request', 'confirm_completion', 'report_not_resolved', 'cancel_request', 'reopen_request'])(
    '%s without expected_revision is refused',
    (type) => {
      const command = VALID.find((candidate) => candidate.type === type);
      const { expected_revision: _dropped, ...payload } = command?.payload ?? {};
      expect(() => parseCommand(body(type, payload))).toThrow(ContractRejected);
    },
  );

  it.each([0, -1, 1.5, '2', null, Number.MAX_SAFE_INTEGER + 1])('expected_revision %j is refused', (revision) => {
    expect(() => parseCommand(body('accept_request', { request_id: 'req-1', expected_revision: revision }))).toThrow(ContractRejected);
  });
});

describe('the rest of each payload', () => {
  it.each([
    ['an unknown field', body('accept_request', { request_id: 'req-1', expected_revision: 1, assignee_id: 'x@tdfb.co' })],
    ['take_over that is not a boolean', body('accept_request', { request_id: 'req-1', expected_revision: 1, take_over: 'yes' })],
    ['no result summary', body('complete_request', { request_id: 'req-1', expected_revision: 2 })],
    ['no completion cycle on confirm', body('confirm_completion', { request_id: 'req-1', expected_revision: 3 })],
    ['a completion cycle of 0', body('confirm_completion', { request_id: 'req-1', expected_revision: 3, completion_cycle_id: 0 })],
    ['no reason on not resolved', body('report_not_resolved', { request_id: 'req-1', expected_revision: 3, completion_cycle_id: 1 })],
    ['no reason on cancel', body('cancel_request', { request_id: 'req-1', expected_revision: 1 })],
    ['no reason on reopen', body('reopen_request', { request_id: 'req-1', expected_revision: 1 })],
    ['a request ID that is a path', body('cancel_request', { request_id: '../requests/x', expected_revision: 1, reason: 'x' })],
  ])('refuses %s', (_label, command) => {
    expect(() => parseCommand(command)).toThrow(ContractRejected);
  });
});
