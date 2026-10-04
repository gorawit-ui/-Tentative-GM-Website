// S03 — a request keeps the calendar it started with: editing the live calendar later must not
// change the snapshot or any due date computed from it (Part 6 §6.7, C8).
import { describe, expect, it } from 'vitest';
import { autoCloseDue, snapshotCalendar, type CalendarSnapshot, type IsoWeekday } from './index';

const at = (iso: string) => Date.parse(iso);
const utc = (instant: number) => new Date(instant).toISOString();

function liveCompanyCalendar() {
  return {
    timeZone: 'Asia/Bangkok',
    openWeekdays: [1, 2, 3, 4, 5] as IsoWeekday[],
    holidays: ['2027-01-01', '2026-12-31'],
  };
}

describe('snapshotCalendar', () => {
  it('editing the live calendar after the snapshot changes neither the snapshot nor its due dates', () => {
    const live = liveCompanyCalendar();
    const snapshot = snapshotCalendar(live);
    const completedAt = at('2026-12-30T16:00:00+07:00');
    const dueBefore = autoCloseDue(completedAt, snapshot);

    live.holidays.push('2027-01-04', '2027-01-05');
    live.openWeekdays.splice(0, live.openWeekdays.length, 1, 2, 3, 4, 5, 6);
    live.timeZone = 'Asia/Tokyo';

    expect(snapshot).toEqual({
      timeZone: 'Asia/Bangkok',
      openWeekdays: [1, 2, 3, 4, 5],
      holidays: ['2026-12-31', '2027-01-01'],
    });
    expect(utc(autoCloseDue(completedAt, snapshot))).toBe(utc(dueBefore));
    expect(utc(dueBefore)).toBe(utc(at('2027-01-06T16:00:00+07:00')));
    // The live calendar now gives a different answer, proving the snapshot is what protected the request.
    expect(autoCloseDue(completedAt, live)).not.toBe(dueBefore);
  });

  it('is deeply immutable', () => {
    const snapshot = snapshotCalendar(liveCompanyCalendar());
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.openWeekdays)).toBe(true);
    expect(Object.isFrozen(snapshot.holidays)).toBe(true);
  });

  it('stores holidays sorted and without duplicates, weekdays sorted', () => {
    const snapshot = snapshotCalendar({
      timeZone: 'Asia/Bangkok',
      openWeekdays: [5, 1, 3],
      holidays: ['2027-01-01', '2026-12-31', '2027-01-01'],
    });
    expect(snapshot.openWeekdays).toEqual([1, 3, 5]);
    expect(snapshot.holidays).toEqual(['2026-12-31', '2027-01-01']);
  });

  it('refuses to snapshot an invalid live calendar', () => {
    const invalid = { ...liveCompanyCalendar(), holidays: ['2026-02-30'] } as CalendarSnapshot;
    expect(() => snapshotCalendar(invalid)).toThrow(RangeError);
  });
});
