// D-S08-6 — `commands/{id}` is not kept forever: a Firestore TTL policy on `expire_at` deletes it
// 30 days after it was stored (deletes only; within the free quota). The policy lives in infra.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMMAND_EXPIRY_FIELD, COMMAND_RETENTION_MS, COMMANDS_COLLECTION } from './index';

const indexes = JSON.parse(readFileSync(new URL('../../../../infra/firestore.indexes.json', import.meta.url), 'utf8')) as {
  readonly fieldOverrides: readonly { collectionGroup: string; fieldPath: string; ttl?: boolean; indexes: unknown[] }[];
};

describe('commands retention (D-S08-6)', () => {
  it('is 30 days on the expire_at field', () => {
    expect(COMMAND_RETENTION_MS).toBe(2_592_000_000);
    expect(COMMAND_EXPIRY_FIELD).toBe('expire_at');
  });

  it('infra/firestore.indexes.json declares the TTL policy on commands.expire_at, without an index', () => {
    expect(indexes.fieldOverrides).toContainEqual({
      collectionGroup: COMMANDS_COLLECTION,
      fieldPath: COMMAND_EXPIRY_FIELD,
      ttl: true,
      indexes: [],
    });
  });
});
