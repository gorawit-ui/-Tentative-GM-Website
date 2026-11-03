// A13 — the duplicate check (U1) queries `request_summaries` by place + symptom + open status; its
// composite index is declared in the repository (the emulator does not check indexes).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const indexes = JSON.parse(readFileSync(new URL('../../../../infra/firestore.indexes.json', import.meta.url), 'utf8')) as {
  readonly indexes: readonly { collectionGroup: string; queryScope: string; fields: readonly { fieldPath: string; order: string }[] }[];
};

describe('duplicate check index (A13)', () => {
  it('request_summaries: location_id + symptom_key + status', () => {
    expect(indexes.indexes).toContainEqual({
      collectionGroup: 'request_summaries',
      queryScope: 'COLLECTION',
      fields: [
        { fieldPath: 'location_id', order: 'ASCENDING' },
        { fieldPath: 'symptom_key', order: 'ASCENDING' },
        { fieldPath: 'status', order: 'ASCENDING' },
      ],
    });
  });
});
