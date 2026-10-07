// D-S08-4 — person IDs are the lowercase @tdfb.co email from the Admin people CSV; the Firebase UID
// is bound at the first login. Rows below are synthetic examples in the CSV shape (name, email, Slack ID).
import { describe, expect, it } from 'vitest';
import { ContractRejected, isPersonId, parseCommand, personIdFromCsvEmail } from './index';

/** Example rows as exported from Workspace and filled in by the Admin (synthetic people). */
const CSV_ROWS = [
  { name: 'สมชาย ตัวอย่าง', email: 'Somchai.T@tdfb.co', slack: 'U01ABCDE' },
  { name: 'สมศรี ทดสอบ', email: '  somsri_t@TDFB.CO ', slack: 'U02FGHIJ' },
  { name: 'มานี มีนา', email: 'manee-m@tdfb.co', slack: '' },
  { name: 'ปิติ ใจดี', email: 'piti.j+gm@tdfb.co', slack: 'U03KLMNO' },
  { name: 'ชูใจ รักงาน', email: 'chujai2026@tdfb.co', slack: 'U04PQRST' },
] as const;

describe('personIdFromCsvEmail', () => {
  it.each([
    [CSV_ROWS[0].email, 'somchai.t@tdfb.co'],
    [CSV_ROWS[1].email, 'somsri_t@tdfb.co'],
    [CSV_ROWS[2].email, 'manee-m@tdfb.co'],
    [CSV_ROWS[3].email, 'piti.j+gm@tdfb.co'],
    [CSV_ROWS[4].email, 'chujai2026@tdfb.co'],
  ])('row email %j → person ID %j', (email, personId) => {
    expect(personIdFromCsvEmail(email)).toBe(personId);
    expect(isPersonId(personId)).toBe(true);
  });

  it.each([
    ['another domain', 'outsider@gmail.com'],
    ['a look-alike domain', 'somchai@tdfb.co.th'],
    ['a subdomain', 'somchai@mail.tdfb.co'],
    ['a space inside', 'som chai@tdfb.co'],
    ['Thai letters', 'สมชาย@tdfb.co'],
    ['an empty cell', ''],
    ['no @', 'somchai.tdfb.co'],
    ['two dots in a row', 'som..chai@tdfb.co'],
    ['a leading dot', '.somchai@tdfb.co'],
    ['a trailing dot', 'somchai.@tdfb.co'],
    ['a path separator', 'som/chai@tdfb.co'],
  ])('rejects %s (%j) with the CSV column as path', (_label, email) => {
    try {
      personIdFromCsvEmail(email, 'rows[3].email');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ContractRejected);
      expect(error).toMatchObject({ code: 'FIELD_INVALID', path: 'rows[3].email' });
    }
  });

  it('isPersonId only accepts the stored (already lowercase) form', () => {
    expect(isPersonId('somchai.t@tdfb.co')).toBe(true);
    expect(isPersonId('Somchai.T@tdfb.co')).toBe(false);
    expect(isPersonId(' somchai.t@tdfb.co')).toBe(false);
    expect(isPersonId('person-employee-03')).toBe(false);
    expect(isPersonId(42)).toBe(false);
  });
});

describe('commands use the same person IDs', () => {
  const onBehalf = (personId: string) => ({
    command_id: '0b9d6c43-8a1e-4c55-9e0f-3f7f5f1a2b3c',
    type: 'create_on_behalf',
    payload: {
      requester: { person_id: personId },
      details: { type: 'document_request', summary_title: 'ขอหนังสือรับรองเงินเดือน', sensitivity_subject: 'personnel' },
    },
  });

  it('a requester picked from the people list (CSV key) is accepted', () => {
    const command = parseCommand(onBehalf(personIdFromCsvEmail(CSV_ROWS[0].email)));
    expect(command.type === 'create_on_behalf' && command.payload.requester).toEqual({ person_id: 'somchai.t@tdfb.co' });
  });

  it.each(['person-employee-03', 'Somchai.T@tdfb.co', 'outsider@gmail.com'])('a requester ID %j is refused', (personId) => {
    expect(() => parseCommand(onBehalf(personId))).toThrow(
      expect.objectContaining({ code: 'FIELD_INVALID', path: 'payload.requester.person_id' }),
    );
  });
});
