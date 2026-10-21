// A11 — the company calendar page (Part 3 §13.4, D-S01-6): people read and type Buddhist-era (พ.ศ.)
// years; the calendar stores Gregorian (ค.ศ.) `YYYY-MM-DD`. A year that looks like ค.ศ. is refused with
// a reason (never silently shifted by 543), so a holiday cannot quietly land in the wrong year.
import { describe, expect, it } from 'vitest';
import { datesOfMonth, formatThaiDate, isLocalTimeOfDay, isoDateFromThaiInput, toBuddhistYear } from './index';

describe('isoDateFromThaiInput: พ.ศ. in, ค.ศ. stored', () => {
  it.each([
    [{ day: 1, month: 1, beYear: 2570 }, '2027-01-01'],
    [{ day: '31', month: '12', beYear: '2569' }, '2026-12-31'],
    [{ day: 29, month: 2, beYear: 2571 }, '2028-02-29'],
    [{ day: ' 5 ', month: 5, beYear: ' 2543 ' }, '2000-05-05'],
    [{ day: 31, month: 12, beYear: 2643 }, '2100-12-31'],
  ])('%o → %s', (input, iso) => {
    expect(isoDateFromThaiInput(input)).toEqual({ ok: true, iso });
  });

  it.each([2026, 2027, 2000, 2100])('a ค.ศ.-looking year (%i) is refused, not converted (D-S01-6)', (beYear) => {
    expect(isoDateFromThaiInput({ day: 1, month: 1, beYear })).toEqual({ ok: false, error: 'YEAR_LOOKS_CE' });
  });

  it.each([2542, 2644, 1999, 2200, 69, 70, 0, -2570, 25700])('a year whose ค.ศ. is outside 2000–2100 is refused (%i)', (beYear) => {
    expect(isoDateFromThaiInput({ day: 1, month: 1, beYear })).toEqual({ ok: false, error: 'YEAR_OUT_OF_RANGE' });
  });

  it.each(['', '   ', 'ปีหน้า', '2570.5', '2,570', undefined])('no year (or not a whole number) → YEAR_MISSING (%j)', (beYear) => {
    expect(isoDateFromThaiInput({ day: 1, month: 1, beYear: beYear as string })).toEqual({ ok: false, error: 'YEAR_MISSING' });
  });

  it.each([
    { day: 29, month: 2, beYear: 2570 },
    { day: 31, month: 4, beYear: 2570 },
    { day: 0, month: 1, beYear: 2570 },
    { day: 1, month: 13, beYear: 2570 },
    { day: 1.5, month: 1, beYear: 2570 },
    { day: '', month: 1, beYear: 2570 },
  ])('a date that does not exist → DATE_INVALID (%o)', (input) => {
    expect(isoDateFromThaiInput(input)).toEqual({ ok: false, error: 'DATE_INVALID' });
  });
});

describe('formatThaiDate', () => {
  it('day, Thai short month, Buddhist-era year (the same words as formatThaiDateTime)', () => {
    expect(formatThaiDate('2027-01-01')).toBe('1 ม.ค. 2570');
    expect(formatThaiDate('2026-12-31')).toBe('31 ธ.ค. 2569');
  });

  it('with the weekday when asked', () => {
    expect(formatThaiDate('2027-01-01', { weekday: true })).toBe('ศุกร์ 1 ม.ค. 2570');
    expect(formatThaiDate('2026-12-28', { weekday: true })).toBe('จันทร์ 28 ธ.ค. 2569');
  });

  it.each(['2027-02-30', '2570-01-01x', '', '27-1-1'])('not a real ค.ศ. date → RangeError (%j)', (iso) => {
    expect(() => formatThaiDate(iso)).toThrow(RangeError);
  });
});

describe('toBuddhistYear', () => {
  it('ค.ศ. + 543', () => {
    expect(toBuddhistYear(2027)).toBe(2570);
  });
});

describe('datesOfMonth: the month grid of the calendar page without Date#get*', () => {
  it('every date with its ISO weekday (1 = Monday)', () => {
    const january = datesOfMonth(2027, 1);
    expect(january).toHaveLength(31);
    expect(january[0]).toEqual({ iso: '2027-01-01', day: 1, isoWeekday: 5 });
    expect(january[3]).toEqual({ iso: '2027-01-04', day: 4, isoWeekday: 1 });
    expect(datesOfMonth(2028, 2)).toHaveLength(29);
    expect(datesOfMonth(2027, 2)).toHaveLength(28);
  });

  it.each([[2027, 0], [2027, 13], [1999, 1], [2101, 1], [2027.5, 1]])('a month outside ค.ศ. 2000–2100 or 1–12 → RangeError (%i-%i)', (year, month) => {
    expect(() => datesOfMonth(year, month)).toThrow(RangeError);
  });
});

describe('isLocalTimeOfDay (FU-30: the reminder time in settings)', () => {
  it.each(['09:00', '00:00', '23:59', '08:30'])('%s is a time', (text) => {
    expect(isLocalTimeOfDay(text)).toBe(true);
  });

  it.each(['9:00', '24:00', '09:60', '0900', '09:00:00', '', ' 09:00', 9])('%j is not', (text) => {
    expect(isLocalTimeOfDay(text)).toBe(false);
  });
});
