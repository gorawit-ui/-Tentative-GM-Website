// Calendar-date arithmetic in an IANA time zone, using only Intl and Date.UTC (no wall clock).
// A "day number" counts Gregorian dates from 1970-01-01 (= 0), independent of any time zone.

const DAY_MS = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

/** Throws RangeError for a time zone that Intl does not know. */
export function zonedFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Wall-clock fields of `instant` in the formatter's zone, re-expressed as if they were UTC. */
function wallClockAsUtc(formatter: Intl.DateTimeFormat, instant: number): number {
  const fields: Record<string, number> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== 'literal') fields[part.type] = Number(part.value);
  }
  const { year = 0, month = 1, day = 1, hour = 0, minute = 0, second = 0 } = fields;
  return Date.UTC(year, month - 1, day, hour, minute, second);
}

/** Offset of the zone from UTC at `instant`, in milliseconds (e.g. +7 h for Asia/Bangkok). */
function offsetAt(formatter: Intl.DateTimeFormat, instant: number): number {
  return wallClockAsUtc(formatter, instant) - Math.floor(instant / 1000) * 1000;
}

/** The calendar date (day number) that `instant` falls on in the zone. */
export function dayNumberAt(formatter: Intl.DateTimeFormat, instant: number): number {
  return Math.floor(wallClockAsUtc(formatter, instant) / DAY_MS);
}

/** The instant at which the given calendar date starts (local 00:00) in the zone. */
export function startOfDay(formatter: Intl.DateTimeFormat, dayNumber: number): number {
  const localMidnight = dayNumber * DAY_MS;
  const guess = localMidnight - offsetAt(formatter, localMidnight);
  return localMidnight - offsetAt(formatter, guess);
}

/** ISO weekday (1 = Monday … 7 = Sunday) of a day number; 1970-01-01 was a Thursday. */
export function isoWeekday(dayNumber: number): number {
  return ((((dayNumber + 3) % 7) + 7) % 7) + 1;
}

/** Day number of a `YYYY-MM-DD` Gregorian date, or undefined when the text is not a real date. */
export function parseIsoDate(text: string): number | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (match === null) return undefined;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || day < 1) return undefined;
  const firstOfMonth = Date.UTC(year, month - 1, 1);
  const daysInMonth = (Date.UTC(year, month, 1) - firstOfMonth) / DAY_MS;
  if (day > daysInMonth) return undefined;
  return firstOfMonth / DAY_MS + day - 1;
}
