// S08 — command contracts at the API boundary (Part 6 §6.3/§6.6): the server decides; a body with an
// unknown field is refused instead of silently dropped, and categories travel as stable keys only
// (D-S04-1): a Thai label in place of the key is refused.
import { describe, expect, it } from 'vitest';
import { GM_CATEGORIES, GM_CATEGORY_KEYS } from '@gm/domain';
import { COMMAND_TYPES, ContractRejected, parseCommand } from './index';

const COMMAND_ID = '0b9d6c43-8a1e-4c55-9e0f-3f7f5f1a2b3c';

const MAINTENANCE = {
  command_id: COMMAND_ID,
  type: 'create_maintenance',
  payload: { location_id: 'loc-fac16', area_id: 'area-fac16-office', symptom_key: 'internet_down', description: 'เน็ตหลุดทั้งชั้น' },
};

const GM_TASK = {
  command_id: COMMAND_ID,
  type: 'create_gm_task',
  payload: {
    summary_title: 'ต่อสัญญาเช่ารถส่งของ',
    category: 'documents_admin',
    sensitivity_subject: 'contract',
    description: 'รายละเอียดภายใน',
  },
};

const ON_BEHALF = {
  command_id: COMMAND_ID,
  type: 'create_on_behalf',
  payload: {
    requester: { person_id: 'person-employee-03' },
    details: { type: 'document_request', summary_title: 'ขอหนังสือรับรองเงินเดือน', sensitivity_subject: 'personnel' },
    mark_confidential: true,
  },
};

const WATCH = { command_id: COMMAND_ID, type: 'watch_request', payload: { request_id: 'req-7f3a9c' } };

function rejection(body: unknown): { code: string; path: string } {
  try {
    parseCommand(body);
  } catch (error) {
    if (error instanceof ContractRejected) return { code: error.code, path: error.path };
    throw error;
  }
  throw new Error('expected ContractRejected');
}

function withPayload<T extends { payload: object }>(body: T, payload: Record<string, unknown>) {
  return { ...body, payload: { ...body.payload, ...payload } };
}

describe('parseCommand — valid commands come back as fresh typed objects', () => {
  it('lists the commands of this session', () => {
    expect(COMMAND_TYPES).toEqual(['create_maintenance', 'create_on_behalf', 'create_gm_task', 'watch_request']);
  });

  it.each([
    ['create_maintenance', MAINTENANCE],
    ['create_gm_task', GM_TASK],
    ['create_on_behalf', ON_BEHALF],
    ['watch_request', WATCH],
  ])('%s', (_type, body) => {
    const parsed = parseCommand(JSON.parse(JSON.stringify(body)));
    expect(parsed).toEqual(body);
  });

  it('optional fields may be left out', () => {
    expect(parseCommand({ ...MAINTENANCE, payload: { location_id: 'loc-fac16', symptom_key: 'internet_down' } })).toEqual({
      ...MAINTENANCE,
      payload: { location_id: 'loc-fac16', symptom_key: 'internet_down' },
    });
    expect(
      parseCommand({
        ...ON_BEHALF,
        payload: {
          requester: { name_text: 'คุณสมศรี (ไม่มีบัญชี)' },
          details: { type: 'maintenance', location_id: 'loc-wh300', symptom_key: 'aircon' },
        },
      }).payload,
    ).toEqual({ requester: { name_text: 'คุณสมศรี (ไม่มีบัญชี)' }, details: { type: 'maintenance', location_id: 'loc-wh300', symptom_key: 'aircon' } });
  });

  it('every one of the 7 category keys is accepted (D-S04-1)', () => {
    for (const category of GM_CATEGORY_KEYS) {
      expect(parseCommand(withPayload(GM_TASK, { category })).payload).toMatchObject({ category });
    }
  });
});

describe('parseCommand — unknown fields are refused at every level', () => {
  it.each([
    ['the envelope', { ...WATCH, actor_id: 'person-gm-01' }, 'actor_id'],
    ['create_maintenance payload (a typed title is ignored by U2, so it is not accepted at all)', withPayload(MAINTENANCE, { summary_title: 'แอร์เสีย' }), 'payload.summary_title'],
    ['create_maintenance payload (requesters cannot set the flag)', withPayload(MAINTENANCE, { mark_confidential: true }), 'payload.mark_confidential'],
    ['create_gm_task payload (gm_task has no requester, C2)', withPayload(GM_TASK, { requester_id: 'person-employee-01' }), 'payload.requester_id'],
    ['create_gm_task payload (initial waiting comes with A21)', withPayload(GM_TASK, { waiting_on: { kind: 'other', name: 'x' } }), 'payload.waiting_on'],
    ['create_gm_task payload (a chosen assignee comes with routing in A01/A21)', withPayload(GM_TASK, { assignee_id: 'person-gm-02' }), 'payload.assignee_id'],
    ['watch_request payload', withPayload(WATCH, { note: 'แจ้งด้วยคน' }), 'payload.note'],
    [
      'the on-behalf requester',
      withPayload(ON_BEHALF, { requester: { person_id: 'person-employee-03', email: 'x@tdfb.co' } }),
      'payload.requester.email',
    ],
    [
      'the on-behalf details',
      withPayload(ON_BEHALF, {
        details: { type: 'document_request', summary_title: 'ขอเอกสาร', sensitivity_subject: 'general', is_confidential: false },
      }),
      'payload.details.is_confidential',
    ],
  ])('%s', (_where, body, path) => {
    expect(rejection(body)).toEqual({ code: 'UNKNOWN_FIELD', path });
  });

  it('a __proto__ key from JSON is an unknown field, not a prototype change', () => {
    const body = JSON.parse(`{"command_id":"${COMMAND_ID}","type":"watch_request","payload":{"request_id":"req-1","__proto__":{"admin":true}}}`);
    expect(rejection(body)).toEqual({ code: 'UNKNOWN_FIELD', path: 'payload.__proto__' });
  });
});

describe('parseCommand — category keys only, never Thai labels (D-S04-1)', () => {
  it.each(Object.values(GM_CATEGORIES))('refuses the label “%s”', (label) => {
    expect(rejection(withPayload(GM_TASK, { category: label }))).toEqual({ code: 'FIELD_INVALID', path: 'payload.category' });
  });

  it.each(['purchasing', 'DOCUMENTS_ADMIN', ' documents_admin', ''])('refuses a key outside the 7 (%j)', (category) => {
    expect(rejection(withPayload(GM_TASK, { category }))).toEqual({ code: 'FIELD_INVALID', path: 'payload.category' });
  });

  it('category is required for create_gm_task (P7-UX-02: no default)', () => {
    const { category: _category, ...payload } = GM_TASK.payload;
    expect(rejection({ ...GM_TASK, payload })).toEqual({ code: 'FIELD_REQUIRED', path: 'payload.category' });
  });
});

describe('parseCommand — envelope, required fields, types and enums', () => {
  it.each([
    ['missing', undefined],
    ['not a UUID', 'click-1'],
    ['upper case', COMMAND_ID.toUpperCase()],
    ['a path', `${COMMAND_ID}/x`],
    ['a number', 12],
  ])('command_id %s', (_label, commandId) => {
    expect(rejection({ ...WATCH, command_id: commandId })).toEqual({ code: 'COMMAND_ID_INVALID', path: 'command_id' });
  });

  it('an unknown command type', () => {
    expect(rejection({ ...WATCH, type: 'delete_request' })).toEqual({ code: 'COMMAND_TYPE_UNKNOWN', path: 'type' });
  });

  it.each([null, [], 'text', 7])('a body that is not an object (%j)', (body) => {
    expect(rejection(body)).toEqual({ code: 'BODY_INVALID', path: '' });
  });

  it('payload must be an object', () => {
    expect(rejection({ ...WATCH, payload: ['req-1'] })).toEqual({ code: 'FIELD_TYPE', path: 'payload' });
  });

  it.each([
    ['payload.location_id', { ...MAINTENANCE, payload: { symptom_key: 'internet_down' } }],
    ['payload.symptom_key', { ...MAINTENANCE, payload: { location_id: 'loc-fac16' } }],
    ['payload.sensitivity_subject', { ...GM_TASK, payload: { summary_title: 'x', category: 'damage' } }],
    ['payload.request_id', { ...WATCH, payload: {} }],
    ['payload.requester', { ...ON_BEHALF, payload: { details: ON_BEHALF.payload.details } }],
  ])('%s is required', (path, body) => {
    expect(rejection(body)).toEqual({ code: 'FIELD_REQUIRED', path });
  });

  it.each([
    ['payload.description', withPayload(MAINTENANCE, { description: 5 })],
    ['payload.mark_confidential', withPayload(GM_TASK, { mark_confidential: 'yes' })],
    ['payload.summary_title', withPayload(GM_TASK, { summary_title: ['ชื่อ'] })],
  ])('%s has the wrong type', (path, body) => {
    expect(rejection(body)).toEqual({ code: 'FIELD_TYPE', path });
  });

  it.each([
    ['payload.sensitivity_subject', withPayload(GM_TASK, { sensitivity_subject: 'สัญญา' })],
    ['payload.details.type', withPayload(ON_BEHALF, { details: { type: 'gm_task', summary_title: 'x', sensitivity_subject: 'general' } })],
    ['payload.request_id', withPayload(WATCH, { request_id: '../requests/other' })],
    ['payload.location_id', withPayload(MAINTENANCE, { location_id: 'loc/fac16' })],
    ['payload.symptom_key', withPayload(MAINTENANCE, { symptom_key: '' })],
    ['payload.requester.person_id', withPayload(ON_BEHALF, { requester: { person_id: 'a.b@tdfb.co' } })],
  ])('%s has an invalid value', (path, body) => {
    expect(rejection(body)).toEqual({ code: 'FIELD_INVALID', path });
  });

  it('the on-behalf requester is either an account or a typed name, not both', () => {
    expect(rejection(withPayload(ON_BEHALF, { requester: { person_id: 'person-1', name_text: 'สมศรี' } }))).toEqual({
      code: 'FIELD_INVALID',
      path: 'payload.requester',
    });
    expect(rejection(withPayload(ON_BEHALF, { requester: {} }))).toEqual({ code: 'FIELD_INVALID', path: 'payload.requester' });
  });

  it('the input object is not changed', () => {
    const body = Object.freeze({ ...WATCH, payload: Object.freeze({ ...WATCH.payload }) });
    expect(() => parseCommand(body)).not.toThrow();
  });
});
