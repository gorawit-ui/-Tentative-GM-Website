// A04 — waiting / follow-up / response and (FU-12, FU-09) related persons and the confidential flag at
// the API boundary (Part 6 §6.6). GM commands carry `expected_revision`; the waited party's answer
// names its waiting interval instead (A2.3: the button checks the interval, access and latest status).
// `waiting_on` keeps no default (F3): the domain refuses a missing or incomplete party with its own code.
import { describe, expect, it } from 'vitest';
import { ContractRejected, isWaitingCommand, parseCommand } from './index';

const COMMAND_ID = '0b9d6c43-8a1e-4c55-9e0f-3f7f5f1a2b3c';
const body = (type: string, payload: Record<string, unknown>) => ({ command_id: COMMAND_ID, type, payload });
const at = { request_id: 'req-1', expected_revision: 4 };

const VALID = [
  body('enter_waiting', { ...at, waiting_on: { kind: 'person', person_id: 'employee01@tdfb.co' } }),
  body('enter_waiting', { ...at, waiting_on: { kind: 'person', person_id: 'employee01@tdfb.co' }, notify: false }),
  body('enter_waiting', { ...at, waiting_on: { kind: 'team', team_label: 'ทีมบัญชี', contact_ids: ['a@tdfb.co', 'b@tdfb.co'] }, confirm_confidential_grant: true }),
  body('enter_waiting', { ...at, waiting_on: { kind: 'government', name: 'สำนักงานเขต' } }),
  // F3: the party is left to the domain, which refuses it with WAITING_ON_REQUIRED.
  body('enter_waiting', { ...at }),
  body('change_waiting_party', { ...at, waiting_on: { kind: 'contractor', name: 'ร้านแอร์' } }),
  body('follow_up', { ...at }),
  body('follow_up', { ...at, remind: true }),
  body('respond_waiting_party', { request_id: 'req-1', waiting_interval_id: 2 }),
  body('respond_waiting_party', { request_id: 'req-1', waiting_interval_id: 2, note: 'ส่งเอกสารแล้ว' }),
  body('resume_work', { ...at }),
  body('add_related_persons', { ...at, person_ids: ['a@tdfb.co'] }),
  body('add_related_persons', { ...at, person_ids: ['a@tdfb.co', 'b@tdfb.co'], confirm_confidential_grant: true }),
  body('remove_related_person', { ...at, person_id: 'a@tdfb.co' }),
  body('mark_confidential', { ...at, sensitivity_reason: 'contract', keep_related_person_ids: [] }),
  body('mark_confidential', { ...at, sensitivity_reason: 'other', note: 'คดีความ', keep_related_person_ids: ['a@tdfb.co'] }),
  body('remove_confidential_flag', { ...at, reason: 'ไม่ใช่เรื่องลับ' }),
];

describe('A04 commands parse into fresh typed objects', () => {
  it.each(VALID.map((command, index) => [`${command.type} #${index}`, command] as const))('%s', (_label, command) => {
    const parsed = parseCommand(JSON.parse(JSON.stringify(command)));
    expect(parsed).toEqual(command);
    expect(isWaitingCommand(parsed)).toBe(true);
  });

  it('lifecycle and create commands are not A04 commands', () => {
    expect(isWaitingCommand(parseCommand(body('accept_request', { request_id: 'req-1', expected_revision: 1 })))).toBe(false);
  });
});

describe('refused at the boundary', () => {
  it.each([
    ['GM command without expected_revision', body('follow_up', { request_id: 'req-1' })],
    ['an unknown field in waiting_on', body('enter_waiting', { ...at, waiting_on: { kind: 'person', person_id: 'a@tdfb.co', colour: 'red' } })],
    ['waiting_on that is not an object', body('enter_waiting', { ...at, waiting_on: 'person' })],
    ['a person ID that is not a lowercase company e-mail', body('enter_waiting', { ...at, waiting_on: { kind: 'person', person_id: 'Somchai' } })],
    ['contact IDs that are not person IDs', body('enter_waiting', { ...at, waiting_on: { kind: 'team', team_label: 'x', contact_ids: ['nope'] } })],
    ['notify that is not a boolean', body('enter_waiting', { ...at, waiting_on: { kind: 'person', person_id: 'a@tdfb.co' }, notify: 'yes' })],
    ['remind that is not a boolean', body('follow_up', { ...at, remind: 1 })],
    ['an answer without its interval', body('respond_waiting_party', { request_id: 'req-1' })],
    ['an answer with interval 0', body('respond_waiting_party', { request_id: 'req-1', waiting_interval_id: 0 })],
    ['an answer that carries a revision instead', body('respond_waiting_party', { request_id: 'req-1', expected_revision: 3, waiting_interval_id: 1 })],
    ['add without people', body('add_related_persons', { ...at })],
    ['remove without a person', body('remove_related_person', { ...at })],
    ['flag without a reason', body('mark_confidential', { ...at, keep_related_person_ids: [] })],
    ['flag with an unknown reason', body('mark_confidential', { ...at, sensitivity_reason: 'gossip', keep_related_person_ids: [] })],
    ['unflag without a reason', body('remove_confidential_flag', { ...at })],
  ])('%s', (_label, command) => {
    expect(() => parseCommand(command)).toThrow(ContractRejected);
  });

  it('the keep list may be left out here; the domain refuses it (KEEP_LIST_REQUIRED, D-ACL-2)', () => {
    expect(parseCommand(body('mark_confidential', { ...at, sensitivity_reason: 'contract' }))).toMatchObject({ payload: { sensitivity_reason: 'contract' } });
  });
});
