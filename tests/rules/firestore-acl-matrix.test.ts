// S10 — every cell of the ACL matrix fixture against infra/firestore.rules on the emulator: allowed
// cells must succeed, everything else must fail (default deny, no client writes anywhere).
// get = open one document; list = query the whole collection without filters (Rules never filter
// results, Part 6 §6.5) with the largest allowed limit (200, D-S10-4); create = a new document in the collection; update/delete = the document.
import { assertFails, assertSucceeds, type RulesTestContext, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { MAX_LIST_LIMIT } from '@gm/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RESOURCES, SUBJECT_KEYS, matrixCells, type AclOperation, type MatrixCell } from './fixtures/acl-matrix';
import { parentOf, startRulesEnvironment, subjectClient, type ClientFirestore } from './support/rules-env';

let env: RulesTestEnvironment;
const clients = new Map<string, RulesTestContext>();

beforeAll(async () => {
  env = await startRulesEnvironment();
});

afterAll(async () => {
  await env?.cleanup();
});

const PROBE = { s10_probe: true };
const RUN: Record<AclOperation, (db: ClientFirestore, path: string) => Promise<unknown>> = {
  get: (db, path) => db.doc(path).get(),
  // D-S10-4: every list the client may run is bounded; the matrix uses the largest allowed page.
  list: (db, path) => db.collection(path).limit(MAX_LIST_LIMIT).get(),
  create: (db, path) => db.doc(`${parentOf(path)}/s10-new-document`).set(PROBE),
  update: (db, path) => db.doc(path).update(PROBE),
  delete: (db, path) => db.doc(path).delete(),
};

const cells = matrixCells();
const label = (cell: MatrixCell) => `${cell.resource.key} ${cell.operation} → ${cell.expected}`;

describe('ACL matrix fixture is complete', () => {
  it('has a decision for every subject × resource × operation', () => {
    expect(cells).toHaveLength(SUBJECT_KEYS.length * RESOURCES.length * 5);
  });
});

describe.each(SUBJECT_KEYS)('%s', (subjectKey) => {
  it.each(cells.filter((cell) => cell.subject.key === subjectKey).map((cell) => [label(cell), cell] as const))('%s', async (_label, cell) => {
    const db = subjectClient(env, clients, subjectKey).firestore();
    const attempt = RUN[cell.operation](db, cell.path);
    if (cell.expected === 'allow') await assertSucceeds(attempt);
    else await assertFails(attempt);
  });
});
