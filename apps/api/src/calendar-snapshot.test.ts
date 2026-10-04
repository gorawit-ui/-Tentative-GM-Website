// D-S01-1 + D-S03-4: the persisted calendar snapshot document (snake_case, hash, source) is built
// on the server when data is saved; @gm/time stays pure and only validates/normalises.
import { describe, expect, it } from 'vitest';
import { fromCalendarSnapshotDocument, toCalendarSnapshotDocument } from './calendar-snapshot';

const SNAPSHOT_AT = Date.parse('2026-12-30T16:00:00+07:00');
const LIVE = {
  timeZone: 'Asia/Bangkok',
  openWeekdays: [5, 4, 3, 2, 1] as (1 | 2 | 3 | 4 | 5)[],
  holidays: ['2027-01-01', '2026-12-31', '2027-01-01'],
};

describe('toCalendarSnapshotDocument', () => {
  it('stores snake_case fields with SHA-256 of the canonical JSON and source = calendar id + snapshot time', () => {
    expect(toCalendarSnapshotDocument(LIVE, { sourceCalendarId: 'company', snapshotAt: SNAPSHOT_AT })).toEqual({
      timezone: 'Asia/Bangkok',
      open_weekdays: [1, 2, 3, 4, 5],
      holidays: ['2026-12-31', '2027-01-01'],
      // printf '%s' '{"timezone":"Asia/Bangkok","open_weekdays":[1,2,3,4,5],"holidays":["2026-12-31","2027-01-01"]}' | sha256sum
      hash: '72bf6a0cfc300abf860cb1aa39f0bcced53bcb49939adddff77dad6c79399956',
      source: 'company@2026-12-30T09:00:00.000Z',
    });
  });

  it('hashes an empty holiday list too', () => {
    const document = toCalendarSnapshotDocument(
      { ...LIVE, holidays: [] },
      { sourceCalendarId: 'company', snapshotAt: SNAPSHOT_AT },
    );
    expect(document.hash).toBe('0f84a3aececba00d48432990e45970405203afb3080253ce4fec5697a9e00554');
  });

  it('gives the same hash for the same calendar content regardless of order or duplicates', () => {
    const a = toCalendarSnapshotDocument(LIVE, { sourceCalendarId: 'company', snapshotAt: SNAPSHOT_AT });
    const b = toCalendarSnapshotDocument(
      { ...LIVE, openWeekdays: [1, 2, 3, 4, 5], holidays: ['2026-12-31', '2027-01-01'] },
      { sourceCalendarId: 'site-01', snapshotAt: SNAPSHOT_AT + 1 },
    );
    expect(b.hash).toBe(a.hash);
    expect(b.source).not.toBe(a.source);
  });

  it('rejects what @gm/time rejects (D-S01-5/6) before hashing', () => {
    const provenance = { sourceCalendarId: 'company', snapshotAt: SNAPSHOT_AT };
    expect(() => toCalendarSnapshotDocument({ ...LIVE, timeZone: 'UTC' }, provenance)).toThrow(RangeError);
    expect(() => toCalendarSnapshotDocument({ ...LIVE, holidays: ['2569-12-31'] }, provenance)).toThrow(RangeError);
  });

  it.each(['', 'company@x', ' company'])('rejects source calendar id %j', (sourceCalendarId) => {
    expect(() => toCalendarSnapshotDocument(LIVE, { sourceCalendarId, snapshotAt: SNAPSHOT_AT })).toThrow(RangeError);
  });

  it('rejects a non-integer snapshot time', () => {
    expect(() => toCalendarSnapshotDocument(LIVE, { sourceCalendarId: 'company', snapshotAt: Number.NaN })).toThrow(
      RangeError,
    );
  });
});

describe('fromCalendarSnapshotDocument', () => {
  it('returns the calculation input @gm/time expects', () => {
    const document = toCalendarSnapshotDocument(LIVE, { sourceCalendarId: 'company', snapshotAt: SNAPSHOT_AT });
    expect(fromCalendarSnapshotDocument(document)).toEqual({
      timeZone: 'Asia/Bangkok',
      openWeekdays: [1, 2, 3, 4, 5],
      holidays: ['2026-12-31', '2027-01-01'],
    });
  });

  it('refuses a document whose content no longer matches its hash', () => {
    const document = toCalendarSnapshotDocument(LIVE, { sourceCalendarId: 'company', snapshotAt: SNAPSHOT_AT });
    expect(() => fromCalendarSnapshotDocument({ ...document, holidays: ['2026-12-31'] })).toThrow(/hash/);
  });
});
