// A11 — Admin changes to the company calendar (Part 3 §13.4, D-S01-6, D-A05-3). Pure: the API reads
// `calendars/company`, asks these for the new content, then writes it; the next tick sees the new hash
// and recomputes stale (≤ 15 minutes). Holidays are ค.ศ. `YYYY-MM-DD` with an optional name; a year
// outside ค.ศ. 2000–2100 (most likely typed as พ.ศ.) is refused, never shifted.
import { CALENDAR_CE_YEARS, isIsoDate, snapshotCalendar, type IsoWeekday } from '@gm/time';
import { reject } from './command-guards';
import { placeLabelOf } from './places';

export interface CompanyCalendarContent {
  readonly timezone: 'Asia/Bangkok';
  readonly openWeekdays: readonly IsoWeekday[];
  /** Sorted, distinct. */
  readonly holidays: readonly string[];
  readonly holidayNames: Readonly<Record<string, string>>;
}

/** Part 3 §13.4 A: the company calendar is Monday–Friday until the Admin says otherwise. */
export const DEFAULT_COMPANY_CALENDAR: CompanyCalendarContent = { timezone: 'Asia/Bangkok', openWeekdays: [1, 2, 3, 4, 5], holidays: [], holidayNames: {} };

/** What is stored now (absent → the default); anything unreadable is left out rather than guessed. */
export function companyCalendarContentOf(stored: unknown): CompanyCalendarContent {
  if (typeof stored !== 'object' || stored === null) return DEFAULT_COMPANY_CALENDAR;
  const record = stored as Record<string, unknown>;
  const weekdays = Array.isArray(record.open_weekdays) ? (record.open_weekdays.filter((day) => Number.isInteger(day) && day >= 1 && day <= 7) as IsoWeekday[]) : [];
  const holidays = Array.isArray(record.holidays) ? [...new Set(record.holidays.filter(isIsoDate))].sort() : [];
  const names: Record<string, string> = {};
  const storedNames = typeof record.holiday_names === 'object' && record.holiday_names !== null ? (record.holiday_names as Record<string, unknown>) : {};
  for (const date of holidays) if (typeof storedNames[date] === 'string') names[date] = storedNames[date];
  return { timezone: 'Asia/Bangkok', openWeekdays: weekdays.length > 0 ? [...new Set(weekdays)].sort() : DEFAULT_COMPANY_CALENDAR.openWeekdays, holidays, holidayNames: names };
}

function checked(content: CompanyCalendarContent): CompanyCalendarContent {
  snapshotCalendar({ timeZone: content.timezone, openWeekdays: content.openWeekdays, holidays: content.holidays });
  return content;
}

function requireHolidayYear(date: string): void {
  const year = Number(date.slice(0, 4));
  if (!isIsoDate(date) || year < CALENDAR_CE_YEARS.first || year > CALENDAR_CE_YEARS.last) {
    reject('HOLIDAY_YEAR_OUT_OF_RANGE', 'Holiday years must be ค.ศ. 2000–2100 (D-S01-6); convert พ.ศ. on the page first');
  }
}

export function planOpenWeekdays(current: CompanyCalendarContent, weekdays: readonly number[]): CompanyCalendarContent {
  const days = [...new Set(weekdays)].sort((a, b) => a - b);
  if (days.length === 0 || days.length !== weekdays.length || !days.every((day) => Number.isInteger(day) && day >= 1 && day <= 7)) {
    reject('WEEKDAYS_INVALID', 'Open weekdays must be distinct ISO weekdays, at least one');
  }
  return checked({ ...current, openWeekdays: days as IsoWeekday[] });
}

/** Add a holiday, or (with `replaces`) change the date and/or name of one. */
export function planPutHoliday(current: CompanyCalendarContent, input: { readonly date: string; readonly name: unknown; readonly replaces?: string | undefined }): CompanyCalendarContent {
  requireHolidayYear(input.date);
  const name = placeLabelOf(input.name);
  const existing = new Set(current.holidays);
  if (input.replaces !== undefined && !existing.has(input.replaces)) reject('HOLIDAY_NOT_FOUND', 'No holiday on that date');
  if (existing.has(input.date) && input.date !== input.replaces) reject('HOLIDAY_EXISTS', 'That date is already a holiday');
  const names: Record<string, string> = { ...current.holidayNames };
  if (input.replaces !== undefined) {
    existing.delete(input.replaces);
    delete names[input.replaces];
  }
  existing.add(input.date);
  names[input.date] = name;
  return checked({ ...current, holidays: [...existing].sort(), holidayNames: names });
}

export function planRemoveHoliday(current: CompanyCalendarContent, date: string): CompanyCalendarContent {
  if (!current.holidays.includes(date)) reject('HOLIDAY_NOT_FOUND', 'No holiday on that date');
  const names: Record<string, string> = { ...current.holidayNames };
  delete names[date];
  return { ...current, holidays: current.holidays.filter((holiday) => holiday !== date), holidayNames: names };
}
