// A10 — people CSV rows (P7-ADMIN-01, D-S08-4, FU-10): the Admin picks the columns from the file's own
// header (the real Workspace export is not seen yet); every row is checked before anything is saved.
// Email → lowercase person ID @tdfb.co only; a duplicate email is an error on every line it appears
// (which line is right is not guessed); name required; team one value; Slack ID optional.
import { describe, expect, it } from 'vitest';
import { checkPeopleRows, peopleRowsFromTable, type PeopleColumnMapping } from './index';

const HEADER = ['Primary Email', 'First Name [Required]', 'Department', 'Slack', 'Phone'];
const MAPPING: PeopleColumnMapping = { email: 0, name: 1, team: 2, slack: 3 };

describe('peopleRowsFromTable: the columns the Admin chose, by header position', () => {
  it('maps each data row; line numbers count the header as line 1; unmapped columns are not taken', () => {
    const rows = peopleRowsFromTable([HEADER, ['A@TDFB.CO', 'เอ', 'บัญชี', 'U01AAA', '081-000-0000']], MAPPING);
    expect(rows).toEqual([{ line: 2, email: 'A@TDFB.CO', name: 'เอ', team: 'บัญชี', slack_user_id: 'U01AAA' }]);
    expect(JSON.stringify(rows)).not.toContain('081-000-0000');
  });

  it('team and Slack columns are optional', () => {
    expect(peopleRowsFromTable([HEADER, ['a@tdfb.co', 'เอ', 'บัญชี', 'U01AAA', '']], { email: 0, name: 1 })).toEqual([{ line: 2, email: 'a@tdfb.co', name: 'เอ' }]);
  });

  it('a row shorter than the header reads its missing cells as empty', () => {
    expect(peopleRowsFromTable([HEADER, ['a@tdfb.co']], MAPPING)).toEqual([{ line: 2, email: 'a@tdfb.co', name: '', team: '', slack_user_id: '' }]);
  });

  it('a column picked twice, or out of the header, is refused', () => {
    expect(() => peopleRowsFromTable([HEADER], { email: 0, name: 0 })).toThrow(/column/);
    expect(() => peopleRowsFromTable([HEADER], { email: 0, name: 9 })).toThrow(/column/);
  });
});

describe('checkPeopleRows', () => {
  const row = (line: number, email: string, name: string, extra: Record<string, string> = {}) => ({ line, email, name, ...extra });

  it('valid rows: lowercase trimmed person ID, one-line name, team as one value, Slack ID kept', () => {
    expect(checkPeopleRows([row(2, '  Somchai.K@TDFB.co ', ' สมชาย   ใจดี ', { team: '  ฝ่าย  บัญชี ', slack_user_id: ' U01ABCDEF ' })])).toEqual({
      valid: [{ line: 2, person_id: 'somchai.k@tdfb.co', name: 'สมชาย ใจดี', team_label: 'ฝ่าย บัญชี', slack_user_id: 'U01ABCDEF' }],
      errors: [],
    });
  });

  it('blank team / Slack cells → no team (“พนักงาน”), no Slack ID', () => {
    expect(checkPeopleRows([row(2, 'a@tdfb.co', 'เอ', { team: ' ', slack_user_id: '' })]).valid).toEqual([{ line: 2, person_id: 'a@tdfb.co', name: 'เอ' }]);
  });

  it('a team cell with commas is still one team (FU-10: one value, never split)', () => {
    expect(checkPeopleRows([row(2, 'a@tdfb.co', 'เอ', { team: 'บัญชี, การเงิน' })]).valid[0]?.team_label).toBe('บัญชี, การเงิน');
  });

  it('errors are reported per line with reasons, and those rows are not imported', () => {
    const result = checkPeopleRows([
      row(2, 'a@gmail.com', 'นอก'),
      row(3, 'b@tdfb.co.th', 'คล้าย'),
      row(4, '', 'ไม่มีอีเมล'),
      row(5, 'c@tdfb.co', '   '),
      row(6, 'D@tdfb.co', 'ดี'),
      row(7, 'd@TDFB.CO', 'ดีซ้ำ'),
      row(8, 'e@tdfb.co', 'อี', { slack_user_id: 'not a slack id' }),
      row(9, 'f@tdfb.co', 'ก'.repeat(101)),
      row(10, 'g@tdfb.co', 'จี', { team: 'ท'.repeat(61) }),
      row(11, 'ok@tdfb.co', 'โอเค'),
    ]);
    expect(result.valid.map((entry) => entry.person_id)).toEqual(['ok@tdfb.co']);
    expect(result.errors).toEqual([
      { line: 2, email: 'a@gmail.com', codes: ['EMAIL_NOT_COMPANY'] },
      { line: 3, email: 'b@tdfb.co.th', codes: ['EMAIL_NOT_COMPANY'] },
      { line: 4, email: '', codes: ['EMAIL_MISSING'] },
      { line: 5, email: 'c@tdfb.co', codes: ['NAME_MISSING'] },
      { line: 6, email: 'd@tdfb.co', codes: ['EMAIL_DUPLICATE'] },
      { line: 7, email: 'd@tdfb.co', codes: ['EMAIL_DUPLICATE'] },
      { line: 8, email: 'e@tdfb.co', codes: ['SLACK_ID_INVALID'] },
      { line: 9, email: 'f@tdfb.co', codes: ['NAME_TOO_LONG'] },
      { line: 10, email: 'g@tdfb.co', codes: ['TEAM_TOO_LONG'] },
    ]);
  });

  it('several problems on one line are all listed', () => {
    expect(checkPeopleRows([row(2, 'x@gmail.com', '')]).errors).toEqual([{ line: 2, email: 'x@gmail.com', codes: ['EMAIL_NOT_COMPANY', 'NAME_MISSING'] }]);
  });

  it('completely blank rows are skipped, not errors', () => {
    expect(checkPeopleRows([row(2, ' ', ' ', { team: '', slack_user_id: '' }), row(3, 'a@tdfb.co', 'เอ')])).toEqual({ valid: [{ line: 3, person_id: 'a@tdfb.co', name: 'เอ' }], errors: [] });
  });
});
