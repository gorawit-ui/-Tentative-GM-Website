// A02 — the tick's due queries (Part 6 §6.11: outbox `state + next_attempt_at + ID`, scheduler
// `state + next_run_at + ID`) have their composite indexes in the repository.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DUE_FIELD } from './store';

const indexes = JSON.parse(readFileSync(new URL('../../../infra/firestore.indexes.json', import.meta.url), 'utf8')) as {
  readonly indexes: readonly { collectionGroup: string; queryScope: string; fields: { fieldPath: string; order: string }[] }[];
};

describe('due query indexes', () => {
  it.each(Object.entries(DUE_FIELD))('%s: state + %s, ascending', (collection, field) => {
    expect(indexes.indexes).toContainEqual({
      collectionGroup: collection,
      queryScope: 'COLLECTION',
      fields: [
        { fieldPath: 'state', order: 'ASCENDING' },
        { fieldPath: field, order: 'ASCENDING' },
      ],
    });
  });
});
