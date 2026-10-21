// A11 — dates on the company calendar page (Part 3 §13.4, D-S01-6). People read and type Buddhist-era
// (พ.ศ.) years; the calendar keeps Gregorian (ค.ศ.) `YYYY-MM-DD`. A typed year that looks like ค.ศ. is
// refused with a reason instead of being shifted by 543 behind the Admin's back, and only years whose
// ค.ศ. is 2000–2100 are accepted (the same range `prepareCalendar` enforces on stored holidays).
import { isoWeekday, parseIsoDate } from './zoned-date';

export const BUDDHIST_ERA_OFFSET = 543;
/** D-S01-6: holiday years must be ค.ศ. 2000–2100 inclusive. */
export const CALENDAR_CE_YEARS = { first: 2000, last: 2100 } as const;

export const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'] as const;
export const THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'] as const;
/** ISO weekday 1 (Monday) … 7 (Sunday). */
export const THAI_WEEKDAYS = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'] as const;

export type ThaiDateInputError = 'YEAR_MISSING' | 'YEAR_LOOKS_CE' | 'YEAR_OUT_OF_RANGE' | 'DATE_INVALID';
export type ThaiDateInput = { readonly ok: true; readonly iso: string } | { readonly ok: false; readonly error: ThaiDateInputError };

/** A whole number typed as digits (spaces around allowed), or a number value; anything else → undefined. */
function wholeNumber(value: number | string | undefined): number | undefined {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return /^-?\d+$/.test(text) ? Number(text) : undefined;
}

const pad = (value: number, width: number) => String(value).padStart(width, '0');

export function toBuddhistYear(ceYear: number): number {
  return ceYear + BUDDHIST_ERA_OFFSET;
}

/** Day, month (1–12) and a พ.ศ. year as typed → the ค.ศ. `YYYY-MM-DD` to store, or why not. */
export function isoDateFromThaiInput(input: {
  readonly day: number | string;
  readonly month: number | string;
  readonly beYear: number | string | undefined;
}): ThaiDateInput {
  const beYear = wholeNumber(input.beYear);
  if (beYear === undefined) return { ok: false, error: 'YEAR_MISSING' };
  if (beYear >= CALENDAR_CE_YEARS.first && beYear <= CALENDAR_CE_YEARS.last) return { ok: false, error: 'YEAR_LOOKS_CE' };
  const ceYear = beYear - BUDDHIST_ERA_OFFSET;
  if (ceYear < CALENDAR_CE_YEARS.first || ceYear > CALENDAR_CE_YEARS.last) return { ok: false, error: 'YEAR_OUT_OF_RANGE' };
  const day = wholeNumber(input.day);
  const month = wholeNumber(input.month);
  if (day === undefined || month === undefined) return { ok: false, error: 'DATE_INVALID' };
  const iso = `${pad(ceYear, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
  if (day < 1 || month < 1 || month > 12 || parseIsoDate(iso) === undefined) return { ok: false, error: 'DATE_INVALID' };
  return { ok: true, iso };
}

/** `1 ม.ค. 2570` (with `weekday`: `ศุกร์ 1 ม.ค. 2570`) of a stored ค.ศ. date; RangeError if not a real date. */
export function formatThaiDate(iso: string, options: { readonly weekday?: boolean } = {}): string {
  const dayNumber = parseIsoDate(iso);
  if (dayNumber === undefined) throw new RangeError(`not a YYYY-MM-DD date: ${JSON.stringify(iso)}`);
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  const text = `${day} ${THAI_MONTHS_SHORT[month - 1]} ${toBuddhistYear(year)}`;
  return options.weekday === true ? `${THAI_WEEKDAYS[isoWeekday(dayNumber) - 1]} ${text}` : text;
}

export interface MonthDate {
  readonly iso: string;
  readonly day: number;
  /** 1 = Monday … 7 = Sunday. */
  readonly isoWeekday: number;
}

/** Every date of a ค.ศ. month (2000–2100) with its weekday — the month grid without Date#get*. */
export function datesOfMonth(ceYear: number, month: number): readonly MonthDate[] {
  if (!Number.isInteger(ceYear) || ceYear < CALENDAR_CE_YEARS.first || ceYear > CALENDAR_CE_YEARS.last || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError('month must be 1–12 of ค.ศ. 2000–2100');
  }
  const dates: MonthDate[] = [];
  for (let day = 1; day <= 31; day += 1) {
    const iso = `${pad(ceYear, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
    const dayNumber = parseIsoDate(iso);
    if (dayNumber === undefined) break;
    dates.push({ iso, day, isoWeekday: isoWeekday(dayNumber) });
  }
  return dates;
}

/** FU-30: a local time of day `HH:MM` (00:00–23:59), the form `nextWorkingMorning` takes. */
export function isLocalTimeOfDay(value: unknown): boolean {
  return typeof value === 'string' && /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

/** A real Gregorian `YYYY-MM-DD` date (any year; holidays then check ค.ศ. 2000–2100). */
export function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && parseIsoDate(value) !== undefined;
}
