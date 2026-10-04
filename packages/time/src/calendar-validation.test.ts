import { describe, expect, it } from 'vitest';
import { addBusinessDuration, addDuration, businessDuration, HOUR_MS, type CalendarSnapshot } from './index';

const START = Date.parse('2026-10-05T09:00:00+07:00');
const CALENDAR: CalendarSnapshot = { timeZone: 'Asia/Bangkok', openWeekdays: [1, 2, 3, 4, 5], holidays: [] };
const operations = [
  (calendar: CalendarSnapshot) => businessDuration(START, START + HOUR_MS, calendar),
  (calendar: CalendarSnapshot) => addBusinessDuration(START, HOUR_MS, calendar),
  (calendar: CalendarSnapshot) => addDuration(START, 1, 'continuous_24h', calendar),
];

describe('D-S01-5: Phase 1 calendars are Bangkok only', () => {
  it.each(['Asia/Tokyo', 'UTC', 'America/New_York', 'Etc/GMT-7'])('rejects %s even when Intl accepts it', (timeZone) => {
    for (const run of operations) {
      expect(() => run({ ...CALENDAR, timeZone })).toThrow(RangeError);
      expect(() => run({ ...CALENDAR, timeZone })).toThrow(/Asia\/Bangkok/);
    }
  });
});

describe('D-S01-6: holidays must use Gregorian years 2000–2100 inclusive', () => {
  it.each(['2569-12-31', '2570-01-01', '1999-12-31', '2101-01-01'])('rejects %s with a likely Buddhist-year explanation', (date) => {
    for (const run of operations) {
      expect(() => run({ ...CALENDAR, holidays: [date] })).toThrow(RangeError);
      expect(() => run({ ...CALENDAR, holidays: [date] })).toThrow(/2000.*2100.*พ\.ศ\./);
    }
  });

  it.each(['2000-02-29', '2100-12-31'])('accepts the valid boundary year %s', (date) => {
    expect(() => businessDuration(START, START + HOUR_MS, { ...CALENDAR, holidays: [date] })).not.toThrow();
  });

  it('does not silently convert a Buddhist year or modify the snapshot', () => {
    const holidays = Object.freeze(['2569-12-31']);
    const calendar = Object.freeze({ ...CALENDAR, holidays });
    expect(() => businessDuration(START, START + HOUR_MS, calendar)).toThrow(RangeError);
    expect(calendar.holidays).toEqual(['2569-12-31']);
  });

  it('keeps rejecting impossible dates inside the accepted year range', () => {
    expect(() => businessDuration(START, START + HOUR_MS, { ...CALENDAR, holidays: ['2100-02-29'] })).toThrow(RangeError);
  });
});

describe('D-S01-2/3/4: canonical units and positive whole-day policy durations', () => {
  it.each(['business_days', 'continuous_24h'] as const)('rejects fractions and zero for %s', (unit) => {
    for (const amount of [0, 0.5, 1.5, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => addDuration(START, amount, unit, CALENDAR)).toThrow(RangeError);
    }
  });

  it('rejects the singular spelling and an hours unit', () => {
    for (const unit of ['business_day', 'hours']) {
      expect(() => addDuration(START, 1, unit as never, CALENDAR)).toThrow(RangeError);
    }
  });
});
