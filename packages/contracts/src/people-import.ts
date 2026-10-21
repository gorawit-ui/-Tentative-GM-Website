// A10 — the rows of the people CSV (P7-ADMIN-01, D-S08-4, FU-10). The Admin chooses the columns from
// the file's own header; only those columns become rows (others never leave the browser). Every row is
// checked the same way in the page (preview) and in the API (before saving): the person ID is the
// trimmed lowercase `@tdfb.co` e-mail; a duplicate e-mail is an error on each of its lines (which is
// right is not guessed); the name is required; the team is one value; the Slack ID is optional.
import { isPersonId } from './person-id';
import { ContractRejected, isPlainObject, join, strictObject, stringField, type JsonObject } from './strict';

export interface PeopleColumnMapping {
  readonly email: number;
  readonly name: number;
  readonly team?: number | undefined;
  readonly slack?: number | undefined;
}

/** One data row of the file, as mapped (cells as typed). */
export interface PeopleImportRow {
  /** The file line (the header is line 1). */
  readonly line: number;
  readonly email: string;
  readonly name: string;
  readonly team?: string;
  readonly slack_user_id?: string;
}

export interface CheckedPerson {
  readonly line: number;
  readonly person_id: string;
  readonly name: string;
  readonly team_label?: string;
  readonly slack_user_id?: string;
}

export type PeopleRowError = 'EMAIL_MISSING' | 'EMAIL_NOT_COMPANY' | 'EMAIL_DUPLICATE' | 'NAME_MISSING' | 'NAME_TOO_LONG' | 'TEAM_TOO_LONG' | 'SLACK_ID_INVALID';

export interface PeopleRowProblem {
  readonly line: number;
  readonly email: string;
  readonly codes: readonly PeopleRowError[];
}

export const MAX_PERSON_NAME_CHARS = 100;
export const MAX_TEAM_LABEL_CHARS = 60;
/** Upper bound of one import (the API body limit is sized for it). */
export const MAX_IMPORT_ROWS = 3000;
const SLACK_USER_ID = /^[UW][A-Z0-9]{2,20}$/;

const oneLine = (value: string | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();

export function peopleRowsFromTable(table: readonly (readonly string[])[], mapping: PeopleColumnMapping): PeopleImportRow[] {
  const header = table[0] ?? [];
  const chosen = [mapping.email, mapping.name, mapping.team, mapping.slack].filter((column): column is number => column !== undefined);
  if (new Set(chosen).size !== chosen.length || chosen.some((column) => !Number.isInteger(column) || column < 0 || column >= header.length)) {
    throw new RangeError('each chosen column must be a different column of the header');
  }
  return table.slice(1).map((cells, index) => ({
    line: index + 2,
    email: cells[mapping.email] ?? '',
    name: cells[mapping.name] ?? '',
    ...(mapping.team === undefined ? {} : { team: cells[mapping.team] ?? '' }),
    ...(mapping.slack === undefined ? {} : { slack_user_id: cells[mapping.slack] ?? '' }),
  }));
}

export function checkPeopleRows(rows: readonly PeopleImportRow[]): { readonly valid: CheckedPerson[]; readonly errors: PeopleRowProblem[] } {
  const filled = rows.filter((row) => [row.email, row.name, row.team, row.slack_user_id].some((value) => oneLine(value) !== ''));
  const seen = new Map<string, number>();
  for (const row of filled) {
    const email = row.email.trim().toLowerCase();
    if (email !== '') seen.set(email, (seen.get(email) ?? 0) + 1);
  }
  const valid: CheckedPerson[] = [];
  const errors: PeopleRowProblem[] = [];
  for (const row of filled) {
    const email = row.email.trim().toLowerCase();
    const name = oneLine(row.name);
    const team = oneLine(row.team);
    const slack = (row.slack_user_id ?? '').trim();
    const codes: PeopleRowError[] = [];
    if (email === '') codes.push('EMAIL_MISSING');
    else if (!isPersonId(email)) codes.push('EMAIL_NOT_COMPANY');
    else if ((seen.get(email) ?? 0) > 1) codes.push('EMAIL_DUPLICATE');
    if (name === '') codes.push('NAME_MISSING');
    else if ([...name].length > MAX_PERSON_NAME_CHARS) codes.push('NAME_TOO_LONG');
    if ([...team].length > MAX_TEAM_LABEL_CHARS) codes.push('TEAM_TOO_LONG');
    if (slack !== '' && !SLACK_USER_ID.test(slack)) codes.push('SLACK_ID_INVALID');
    if (codes.length > 0) {
      errors.push({ line: row.line, email, codes });
      continue;
    }
    valid.push({ line: row.line, person_id: email, name, ...(team === '' ? {} : { team_label: team }), ...(slack === '' ? {} : { slack_user_id: slack }) });
  }
  return { valid, errors };
}

/** The import / preview body at the API: mapped rows only (an unknown field — a raw file — is refused). */
export interface PeopleImportBody {
  readonly rows: readonly PeopleImportRow[];
  /** Whether the Admin chose a Slack ID column (a blank cell then clears a stored ID). */
  readonly slack_column: boolean;
}

function rowOf(value: unknown, path: string): PeopleImportRow {
  const row = strictObject(value, path, ['line', 'email', 'name', 'team', 'slack_user_id']);
  const line = row.line;
  if (typeof line !== 'number' || !Number.isSafeInteger(line) || line < 2) throw new ContractRejected('FIELD_INVALID', join(path, 'line'), 'line must be a file line ≥ 2');
  const optionalText = (key: string) => (Object.hasOwn(row, key) && row[key] !== undefined ? { [key]: stringField(row, path, key) } : {});
  return { line, email: stringField(row, path, 'email'), name: stringField(row, path, 'name'), ...optionalText('team'), ...optionalText('slack_user_id') } as PeopleImportRow;
}

export function parsePeopleImportBody(body: unknown, extra: readonly string[] = []): PeopleImportBody & Readonly<Record<string, unknown>> {
  if (!isPlainObject(body)) throw new ContractRejected('BODY_INVALID', '', 'the body must be a JSON object');
  const object: JsonObject = strictObject(body, '', ['rows', 'slack_column', ...extra]);
  const rows = object.rows;
  if (!Array.isArray(rows)) throw new ContractRejected('FIELD_TYPE', 'rows', 'rows must be a list');
  if (rows.length > MAX_IMPORT_ROWS) throw new ContractRejected('FIELD_INVALID', 'rows', `at most ${MAX_IMPORT_ROWS} rows`);
  const slack = object.slack_column;
  if (typeof slack !== 'boolean') throw new ContractRejected('FIELD_TYPE', 'slack_column', 'slack_column must be true or false');
  return { ...object, rows: rows.map((row: unknown, index) => rowOf(row, `rows[${index}]`)), slack_column: slack };
}
