// A13 — U1 “มีคนแจ้งเรื่องนี้แล้ว”: which open repair requests count as the same report as the place,
// area and symptom just chosen (never the GM-editable title), and how the reader relates to each.
import { describe, expect, it } from 'vitest';
import {
  MAX_KNOWN_DUPLICATES,
  MAX_WATCH_NOTE_CHARS,
  unansweredDuplicates,
  duplicateMatches,
  isDuplicateMatch,
  viewerRelation,
  watchNote,
  type DuplicateCandidate,
} from './duplicates';
import { LifecycleRejected } from './command-guards';

const base: DuplicateCandidate = {
  requestId: 'req-1',
  type: 'maintenance',
  status: 'queued',
  locationId: 'loc-wh300',
  areaId: 'area-pack-1',
  symptomKey: 'aircon',
  createdAt: 100,
};
const chosen = { locationId: 'loc-wh300', areaId: 'area-pack-1', symptomKey: 'aircon' };

describe('isDuplicateMatch — U1 matching', () => {
  it('same place + area + symptom of an open repair matches (queued, in_progress, waiting)', () => {
    for (const status of ['queued', 'in_progress', 'waiting'] as const) expect(isDuplicateMatch({ ...base, status }, chosen)).toBe(true);
  });

  it('completed (awaiting confirmation, D-S08-7), closed or cancelled never match', () => {
    expect(isDuplicateMatch({ ...base, status: 'completed' }, chosen)).toBe(false);
    expect(isDuplicateMatch({ ...base, status: 'completed', closedAt: 200 }, chosen)).toBe(false);
    expect(isDuplicateMatch({ ...base, status: 'cancelled' }, chosen)).toBe(false);
    expect(isDuplicateMatch({ ...base, closedAt: 200 }, chosen)).toBe(false);
  });

  it('a confidential request or one that is not a repair never matches', () => {
    expect(isDuplicateMatch({ ...base, isConfidential: true }, chosen)).toBe(false);
    expect(isDuplicateMatch({ ...base, type: 'gm_task' }, chosen)).toBe(false);
  });

  it('“อื่นๆ” is never matched, on either side', () => {
    expect(isDuplicateMatch({ ...base, symptomKey: 'other' }, { ...chosen, symptomKey: 'other' })).toBe(false);
  });

  it('a different place or symptom does not match', () => {
    expect(isDuplicateMatch({ ...base, locationId: 'loc-fac16' }, chosen)).toBe(false);
    expect(isDuplicateMatch({ ...base, symptomKey: 'light_bulb' }, chosen)).toBe(false);
    expect(isDuplicateMatch({ ...base, symptomKey: undefined }, chosen)).toBe(false);
  });

  it('areas given on both sides and different → not the same; area “ไม่ระบุ” on either side → place + symptom', () => {
    expect(isDuplicateMatch({ ...base, areaId: 'area-qa-1' }, chosen)).toBe(false);
    expect(isDuplicateMatch({ ...base, areaId: undefined }, chosen)).toBe(true);
    expect(isDuplicateMatch(base, { locationId: 'loc-wh300', symptomKey: 'aircon' })).toBe(true);
    expect(isDuplicateMatch({ ...base, areaId: undefined }, { locationId: 'loc-wh300', symptomKey: 'aircon' })).toBe(true);
  });
});

describe('duplicateMatches', () => {
  it('keeps only the matches, the first report first', () => {
    const later = { ...base, requestId: 'req-2', createdAt: 300 };
    const earlier = { ...base, requestId: 'req-3', createdAt: 50, areaId: undefined };
    const closed = { ...base, requestId: 'req-4', status: 'completed' as const };
    expect(duplicateMatches([later, closed, earlier, base], chosen).map((match) => match.requestId)).toEqual(['req-3', 'req-1', 'req-2']);
  });

  it('nothing for “อื่นๆ”', () => {
    expect(duplicateMatches([{ ...base, symptomKey: 'other' }], { ...chosen, symptomKey: 'other' })).toEqual([]);
  });
});

describe('viewerRelation', () => {
  it('the requester, a watcher, or neither', () => {
    expect(viewerRelation({ requesterId: 'a@tdfb.co', watcherIds: [] }, 'a@tdfb.co')).toBe('requester');
    expect(viewerRelation({ requesterId: 'a@tdfb.co', watcherIds: ['b@tdfb.co'] }, 'b@tdfb.co')).toBe('watcher');
    expect(viewerRelation({ requesterId: 'a@tdfb.co', watcherIds: ['b@tdfb.co'] }, 'c@tdfb.co')).toBe('none');
    expect(viewerRelation({ watcherIds: [] }, 'c@tdfb.co')).toBe('none');
  });
});

describe('watchNote — the one note sent with a watch (U1)', () => {
  it('optional: blank means none; otherwise trimmed', () => {
    expect(watchNote(undefined)).toBeUndefined();
    expect(watchNote('   \n ')).toBeUndefined();
    expect(watchNote('  แอร์มีน้ำหยดด้วย \n')).toBe('แอร์มีน้ำหยดด้วย');
  });

  it(`up to ${MAX_WATCH_NOTE_CHARS} characters (Thai counted per character)`, () => {
    expect(watchNote('ก'.repeat(MAX_WATCH_NOTE_CHARS))).toHaveLength(MAX_WATCH_NOTE_CHARS);
    expect(() => watchNote('ก'.repeat(MAX_WATCH_NOTE_CHARS + 1))).toThrow(LifecycleRejected);
    try {
      watchNote('ก'.repeat(MAX_WATCH_NOTE_CHARS + 1));
    } catch (error) {
      expect((error as LifecycleRejected).code).toBe('NOTE_TOO_LONG');
    }
  });
});

describe('A14 / FU-49: the recheck when sending asks only about requests not answered yet', () => {
  it('matches the person already said “ไม่ใช่” to are not asked again; a new one is', () => {
    expect(unansweredDuplicates(['req-1', 'req-2'], ['req-1', 'req-2'])).toEqual([]);
    expect(unansweredDuplicates(['req-1', 'req-3'], ['req-1', 'req-2'])).toEqual(['req-3']);
    expect(unansweredDuplicates(['req-3'], [])).toEqual(['req-3']);
  });

  it(`at most ${MAX_KNOWN_DUPLICATES} answered IDs travel with a request`, () => {
    expect(MAX_KNOWN_DUPLICATES).toBe(20);
  });
});
