// S08 — command fingerprint: SHA-256 of canonical JSON of actor + type + payload (Part 6 §6.6).
// Same command → same fingerprint whatever the key order; anything else differs.
import { describe, expect, it } from 'vitest';
import { commandFingerprint } from './fingerprint';

const BASE = {
  command_id: '0b9d6c43-8a1e-4c55-9e0f-3f7f5f1a2b3c',
  type: 'create_maintenance',
  payload: { location_id: 'loc-fac16', symptom_key: 'internet_down' },
} as const;

describe('commandFingerprint', () => {
  it('is a SHA-256 hex digest', () => {
    expect(commandFingerprint('person-employee-01', BASE)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not depend on key order', () => {
    const reordered = { payload: { symptom_key: 'internet_down', location_id: 'loc-fac16' }, type: 'create_maintenance', command_id: BASE.command_id } as const;
    expect(commandFingerprint('person-employee-01', reordered)).toBe(commandFingerprint('person-employee-01', BASE));
  });

  it('changes with the actor, the type or the payload, but not with the command ID itself', () => {
    const base = commandFingerprint('person-employee-01', BASE);
    expect(commandFingerprint('person-employee-02', BASE)).not.toBe(base);
    expect(commandFingerprint('person-employee-01', { ...BASE, payload: { ...BASE.payload, area_id: 'area-1' } })).not.toBe(base);
    expect(commandFingerprint('person-employee-01', { ...BASE, type: 'watch_request', payload: { request_id: 'req-1' } })).not.toBe(base);
    const sameCommandOtherId = { ...BASE, command_id: '1c9d6c43-8a1e-4c55-9e0f-3f7f5f1a2b3c' };
    expect(commandFingerprint('person-employee-01', sameCommandOtherId)).toBe(base);
  });
});
