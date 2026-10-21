// D-S08-6 — `commands/{id}` is not kept forever: a Firestore TTL policy on `expire_at` deletes it
// 30 days after it was stored (deletes only; within the free quota). The policy lives in infra.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMMAND_EXPIRY_FIELD, COMMAND_RETENTION_MS, COMMANDS_COLLECTION, OUTBOX_RETENTION_MS } from './index';

const indexes = JSON.parse(readFileSync(new URL('../../../../infra/firestore.indexes.json', import.meta.url), 'utf8')) as {
  readonly indexes: readonly { collectionGroup: string; queryScope: string; fields: readonly { fieldPath: string; order: string }[] }[];
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

describe('outbox retention (D-A11-6)', () => {
  it('90 days, on the same expire_at field', () => {
    expect(OUTBOX_RETENTION_MS).toBe(90 * 24 * 60 * 60 * 1000);
  });

  it('infra declares the TTL policy on outbox.expire_at, without an index', () => {
    expect(indexes.fieldOverrides).toContainEqual({ collectionGroup: 'outbox', fieldPath: 'expire_at', ttl: true, indexes: [] });
  });

  it('the health page counts fallbacks of the last 7 days: an index on slack_fallback_code + next_attempt_at', () => {
    expect(indexes.indexes).toContainEqual({
      collectionGroup: 'outbox',
      queryScope: 'COLLECTION',
      fields: [
        { fieldPath: 'slack_fallback_code', order: 'ASCENDING' },
        { fieldPath: 'next_attempt_at', order: 'ASCENDING' },
      ],
    });
  });
});
