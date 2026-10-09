// A07 — the date shown in messages and on screens (Part 3 §1: Thai, Buddhist-era year, Asia/Bangkok
// time, an explicit time for important events): one pure formatter for both, so a notice and the
// page it links to say the same thing.
import { describe, expect, it } from 'vitest';
import { formatThaiDateTime } from './index';

const at = (iso: string) => Date.parse(iso);

describe('formatThaiDateTime', () => {
  it('day, Thai short month, Buddhist-era year, 24-hour Bangkok time', () => {
    expect(formatThaiDateTime(at('2027-01-06T16:00:00+07:00'))).toBe('6 ม.ค. 2570 16:00 น.');
    expect(formatThaiDateTime(at('2026-10-09T08:05:00+07:00'))).toBe('9 ต.ค. 2569 08:05 น.');
  });

  it('uses the Bangkok date, not UTC: 00:30 on New Year in Bangkok is still 31 Dec in UTC', () => {
    expect(formatThaiDateTime(at('2026-12-31T17:30:00Z'))).toBe('1 ม.ค. 2570 00:30 น.');
  });

  it('every month has its Thai short name', () => {
    const months = Array.from({ length: 12 }, (_, index) => formatThaiDateTime(Date.UTC(2027, index, 15, 5, 0)).split(' ')[1]);
    expect(months).toEqual(['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']);
  });

  it('refuses something that is not an instant', () => {
    expect(() => formatThaiDateTime(Number.NaN)).toThrow(RangeError);
    expect(() => formatThaiDateTime(1.5)).toThrow(RangeError);
  });
});
