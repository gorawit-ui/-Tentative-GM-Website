// A10 — the people CSV is read in the browser (the file itself never leaves it, nor is it kept):
// RFC 4180 fields — quotes, doubled quotes, commas and line breaks inside quotes, CRLF, a BOM from
// Excel/Sheets, blank lines skipped.
import { describe, expect, it } from 'vitest';
import { parseCsv } from './index';

describe('parseCsv', () => {
  it('rows of cells, header first', () => {
    expect(parseCsv('Email,Full Name,Team\na@tdfb.co,สมมติ ใจดี,บัญชี\n')).toEqual([
      ['Email', 'Full Name', 'Team'],
      ['a@tdfb.co', 'สมมติ ใจดี', 'บัญชี'],
    ]);
  });

  it('quoted cells: commas, doubled quotes and line breaks inside; CRLF and a BOM', () => {
    expect(parseCsv('﻿"Email","Name"\r\n"b@tdfb.co","ทดสอบ, ""ชื่อเล่น"" ใจดี"\r\n"c@tdfb.co","สองบรรทัด\nต่อ"\r\n')).toEqual([
      ['Email', 'Name'],
      ['b@tdfb.co', 'ทดสอบ, "ชื่อเล่น" ใจดี'],
      ['c@tdfb.co', 'สองบรรทัด\nต่อ'],
    ]);
  });

  it('empty cells stay (as ""); a last line without a newline is read; blank lines are skipped', () => {
    expect(parseCsv('a,b,c\n\n1,,3\r\n\r\n4,5,')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
      ['4', '5', ''],
    ]);
  });

  it('a quote that never closes is an error, not a guess', () => {
    expect(() => parseCsv('a,b\n"x,y\n')).toThrow(/CSV/);
  });

  it('nothing → no rows', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('\n\r\n')).toEqual([]);
  });
});
