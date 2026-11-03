// A14 / FU-47 (D-A12-5): the repair form's draft lives in this tab's session only — the choices and the
// text, never a photo — belongs to the person who wrote it, and is gone after sending or logout.
import { describe, expect, it } from 'vitest';
import { REPAIR_DRAFT_KEY, clearRepairDraft, loadRepairDraft, saveRepairDraft, type RepairDraft } from './repair-draft';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, String(value)),
  };
}

const DRAFT: RepairDraft = {
  personId: 'a14.person@tdfb.co',
  step: 4,
  locationId: 'loc-office195',
  areaId: '',
  symptomKey: 'internet',
  description: 'เน็ตช้ามาก',
  commandId: '6c0e8b0e-7d3f-4d55-9e3e-6a0c1d1b2a10',
  dismissed: ['req-1'],
};

describe('repair draft (FU-47)', () => {
  it('saved and read back for the same person', () => {
    const storage = memoryStorage();
    saveRepairDraft(storage, DRAFT);
    expect(loadRepairDraft(storage, DRAFT.personId)).toEqual(DRAFT);
  });

  it('only the choices, the text and the send ID are stored — no photo or anything else passed in', () => {
    const storage = memoryStorage();
    saveRepairDraft(storage, { ...DRAFT, photos: ['data:image/jpeg;base64,AAAA'] } as RepairDraft);
    const stored = JSON.parse(storage.getItem(REPAIR_DRAFT_KEY) ?? '{}') as Record<string, unknown>;
    expect(Object.keys(stored).sort()).toEqual(['areaId', 'commandId', 'description', 'dismissed', 'locationId', 'personId', 'step', 'symptomKey', 'v']);
    expect(JSON.stringify(stored)).not.toContain('data:image');
  });

  it('someone else’s draft (another account in the same tab) is not shown and is removed', () => {
    const storage = memoryStorage();
    saveRepairDraft(storage, DRAFT);
    expect(loadRepairDraft(storage, 'someone.else@tdfb.co')).toBeUndefined();
    expect(storage.getItem(REPAIR_DRAFT_KEY)).toBeNull();
  });

  it('a damaged or older draft is ignored and removed', () => {
    const storage = memoryStorage();
    storage.setItem(REPAIR_DRAFT_KEY, '{not json');
    expect(loadRepairDraft(storage, DRAFT.personId)).toBeUndefined();
    expect(storage.getItem(REPAIR_DRAFT_KEY)).toBeNull();
    storage.setItem(REPAIR_DRAFT_KEY, JSON.stringify({ ...DRAFT, v: 0 }));
    expect(loadRepairDraft(storage, DRAFT.personId)).toBeUndefined();
    storage.setItem(REPAIR_DRAFT_KEY, JSON.stringify({ ...DRAFT, v: 1, step: 9 }));
    expect(loadRepairDraft(storage, DRAFT.personId)).toBeUndefined();
  });

  it('cleared after sending', () => {
    const storage = memoryStorage();
    saveRepairDraft(storage, DRAFT);
    clearRepairDraft(storage);
    expect(storage.length).toBe(0);
  });

  it('a storage that refuses (private mode, full) never breaks the form', () => {
    const broken = { ...memoryStorage(), setItem: () => { throw new Error('QuotaExceededError'); }, getItem: () => { throw new Error('SecurityError'); } } as Storage;
    expect(() => saveRepairDraft(broken, DRAFT)).not.toThrow();
    expect(loadRepairDraft(broken, DRAFT.personId)).toBeUndefined();
    expect(() => clearRepairDraft(broken)).not.toThrow();
  });
});
