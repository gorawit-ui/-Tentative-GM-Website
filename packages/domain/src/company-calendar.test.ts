// A11 — Admin changes to the company calendar (Part 3 §13.4, D-S01-6): Monday–Friday by default,
// holidays ค.ศ. with a name, the same date never twice, a พ.ศ.-looking year refused (never shifted).
import { describe, expect, it } from 'vitest';
import { DEFAULT_COMPANY_CALENDAR, LifecycleRejected, companyCalendarContentOf, planOpenWeekdays, planPutHoliday, planRemoveHoliday } from './index';

const rejected = (work: () => unknown) => {
  try {
    work();
  } catch (error) {
    if (error instanceof LifecycleRejected) return error.code;
    throw error;
  }
  return 'accepted';
};

const withNewYear = planPutHoliday(DEFAULT_COMPANY_CALENDAR, { date: '2027-01-01', name: 'วันขึ้นปีใหม่' });

describe('companyCalendarContentOf', () => {
  it('nothing stored → Monday–Friday, no holidays', () => {
    expect(companyCalendarContentOf(undefined)).toEqual({ timezone: 'Asia/Bangkok', openWeekdays: [1, 2, 3, 4, 5], holidays: [], holidayNames: {} });
  });

  it('stored holidays sorted and distinct; names only for holidays; unreadable entries left out', () => {
    expect(
      companyCalendarContentOf({ open_weekdays: [5, 1, 9], holidays: ['2027-01-01', '2026-12-31', '2027-01-01', 'x'], holiday_names: { '2027-01-01': 'ปีใหม่', '2027-02-02': 'ไม่มีวันนี้', '2026-12-31': 3 } }),
    ).toEqual({ timezone: 'Asia/Bangkok', openWeekdays: [1, 5], holidays: ['2026-12-31', '2027-01-01'], holidayNames: { '2027-01-01': 'ปีใหม่' } });
  });
});

describe('holidays', () => {
  it('add: sorted with its name', () => {
    expect(planPutHoliday(withNewYear, { date: '2026-12-31', name: ' วันสิ้นปี ' })).toMatchObject({
      holidays: ['2026-12-31', '2027-01-01'],
      holidayNames: { '2026-12-31': 'วันสิ้นปี', '2027-01-01': 'วันขึ้นปีใหม่' },
    });
  });

  it('D-S01-6: a year outside ค.ศ. 2000–2100 → HOLIDAY_YEAR_OUT_OF_RANGE', () => {
    expect(rejected(() => planPutHoliday(DEFAULT_COMPANY_CALENDAR, { date: '2570-01-01', name: 'ปีใหม่' }))).toBe('HOLIDAY_YEAR_OUT_OF_RANGE');
    expect(rejected(() => planPutHoliday(DEFAULT_COMPANY_CALENDAR, { date: '1999-12-31', name: 'x' }))).toBe('HOLIDAY_YEAR_OUT_OF_RANGE');
  });

  it('the same date twice → HOLIDAY_EXISTS; a blank name → LABEL_INVALID', () => {
    expect(rejected(() => planPutHoliday(withNewYear, { date: '2027-01-01', name: 'ซ้ำ' }))).toBe('HOLIDAY_EXISTS');
    expect(rejected(() => planPutHoliday(withNewYear, { date: '2027-01-02', name: '  ' }))).toBe('LABEL_INVALID');
  });

  it('edit: move the date and/or rename; onto another holiday → HOLIDAY_EXISTS; unknown → HOLIDAY_NOT_FOUND', () => {
    expect(planPutHoliday(withNewYear, { date: '2027-01-04', name: 'ชดเชยปีใหม่', replaces: '2027-01-01' })).toMatchObject({ holidays: ['2027-01-04'], holidayNames: { '2027-01-04': 'ชดเชยปีใหม่' } });
    expect(planPutHoliday(withNewYear, { date: '2027-01-01', name: 'ปีใหม่', replaces: '2027-01-01' })).toMatchObject({ holidays: ['2027-01-01'], holidayNames: { '2027-01-01': 'ปีใหม่' } });
    const two = planPutHoliday(withNewYear, { date: '2027-01-04', name: 'ชดเชย' });
    expect(rejected(() => planPutHoliday(two, { date: '2027-01-04', name: 'x', replaces: '2027-01-01' }))).toBe('HOLIDAY_EXISTS');
    expect(rejected(() => planPutHoliday(withNewYear, { date: '2027-01-05', name: 'x', replaces: '2027-01-09' }))).toBe('HOLIDAY_NOT_FOUND');
  });

  it('remove', () => {
    expect(planRemoveHoliday(withNewYear, '2027-01-01')).toMatchObject({ holidays: [], holidayNames: {} });
    expect(rejected(() => planRemoveHoliday(withNewYear, '2027-01-02'))).toBe('HOLIDAY_NOT_FOUND');
  });
});

describe('open weekdays', () => {
  it('any distinct set of at least one day, sorted', () => {
    expect(planOpenWeekdays(DEFAULT_COMPANY_CALENDAR, [6, 1, 2]).openWeekdays).toEqual([1, 2, 6]);
  });

  it.each([[[]], [[1, 1]], [[0]], [[8]], [[1.5]]])('%j → WEEKDAYS_INVALID', (days) => {
    expect(rejected(() => planOpenWeekdays(DEFAULT_COMPANY_CALENDAR, days))).toBe('WEEKDAYS_INVALID');
  });
});
