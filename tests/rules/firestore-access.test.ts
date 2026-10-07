// S10 — access checks the matrix alone does not show: exact corporate e-mail (no lookalike domains),
// the access document as the only source of role/enabled, queries on `requests` from non-GM accounts
// (denied even when filtered to their own requests), no self-service writes to `access`, the bounded
// queries the screens will run, and summaries carrying only allowlisted fields. Emulator only.
import { assertFails, assertSucceeds, type RulesTestContext, type RulesTestEnvironment, type TokenOptions } from '@firebase/rules-unit-testing';
import { MAX_LIST_LIMIT, REQUEST_SUMMARY_FIELDS } from '@gm/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GENERAL_REQUEST_ID, SECRET_REQUEST_ID, SUBJECTS, type SubjectKey } from './fixtures/acl-matrix';
import { clientFor, seed, startRulesEnvironment, subjectClient } from './support/rules-env';

let env: RulesTestEnvironment;
const clients = new Map<string, RulesTestContext>();

const google = (email: string, overrides: Partial<TokenOptions> = {}): TokenOptions => ({
  email,
  email_verified: true,
  firebase: { sign_in_provider: 'google.com' },
  ...overrides,
});

interface Probe {
  readonly name: string;
  readonly uid: string;
  readonly token: TokenOptions;
  /** The access document seeded for this uid (enabled, so only the token decides). */
  readonly access?: Readonly<Record<string, unknown>>;
}

const enabledRequester = (email: string) => ({ person_id: email.toLowerCase(), role: 'requester', enabled: true });

/** Control: exactly the shape the Rules accept. */
const CONTROL: Probe = { name: 'control x@tdfb.co', uid: 'uid-probe-control', token: google('probe.control@tdfb.co'), access: enabledRequester('probe.control@tdfb.co') };

/** Lookalike or wrong sign-ins, each with an enabled access document so only the token is at fault. */
const LOOKALIKES: readonly Probe[] = [
  ['x@tdfb.co.th', 'probe.th@tdfb.co.th'],
  ['x@tdfb.com', 'probe.com@tdfb.com'],
  ['subdomain x@mail.tdfb.co', 'probe.sub@mail.tdfb.co'],
  ['dot as wildcard x@tdfbxco', 'probe.wild@tdfbxco'],
  ['suffix x@tdfb.co.evil.com', 'probe.evil@tdfb.co.evil.com'],
  ['prefix x@eviltdfb.co', 'probe.prefix@eviltdfb.co'],
  ['tdfb.co@gmail.com', 'tdfb.co@gmail.com'],
  ['upper-case lookalike x@TDFB.CO.TH', 'probe.upperth@TDFB.CO.TH'],
  ['upper-case subdomain x@MAIL.TDFB.CO', 'probe.uppersub@MAIL.TDFB.CO'],
  ['trailing space', 'probe.space@tdfb.co '],
  ['two @', 'probe@x@tdfb.co'],
  ['empty local part', '@tdfb.co'],
].map(([name, email], index) => ({ name: name!, uid: `uid-probe-lookalike-${index}`, token: google(email!), access: enabledRequester(email!) }));

/** D-S10-5: the domain is checked after lower(), like person IDs from the CSV (D-S08-4). */
const CASE_VARIANTS: readonly Probe[] = [
  ['upper-case domain x@TDFB.CO', 'probe.upper@TDFB.CO'],
  ['mixed case Probe.Mixed@TdFb.Co', 'Probe.Mixed@TdFb.Co'],
].map(([name, email], index) => ({ name: name!, uid: `uid-probe-case-${index}`, token: google(email!), access: enabledRequester(email!) }));

const WRONG_SIGN_IN: readonly Probe[] = [
  { name: 'unverified @tdfb.co', uid: 'uid-probe-unverified', token: google('probe.unverified@tdfb.co', { email_verified: false }), access: enabledRequester('probe.unverified@tdfb.co') },
  {
    name: 'password provider @tdfb.co',
    uid: 'uid-probe-password',
    token: google('probe.password@tdfb.co', { firebase: { sign_in_provider: 'password' } }),
    access: enabledRequester('probe.password@tdfb.co'),
  },
  {
    name: 'anonymous provider',
    uid: 'uid-probe-anonymous',
    token: { firebase: { sign_in_provider: 'anonymous' } },
    access: enabledRequester('probe.anonymous@tdfb.co'),
  },
  { name: 'no access document', uid: 'uid-probe-no-access', token: google('probe.noaccess@tdfb.co') },
  {
    name: 'enabled stored as the string "true"',
    uid: 'uid-probe-string-enabled',
    token: google('probe.string@tdfb.co'),
    access: { person_id: 'probe.string@tdfb.co', role: 'requester', enabled: 'true' },
  },
  {
    name: 'access document without enabled',
    uid: 'uid-probe-no-enabled',
    token: google('probe.noenabled@tdfb.co'),
    access: { person_id: 'probe.noenabled@tdfb.co', role: 'requester' },
  },
];

/** A role claim in the token is ignored: the access document is authoritative (Part 6 §6.5). */
const CLAIM_SPOOF: Probe = {
  name: 'requester with a gm_admin custom claim',
  uid: 'uid-probe-claim',
  token: google('probe.claim@tdfb.co', { role: 'gm_admin', admin: true }),
  access: enabledRequester('probe.claim@tdfb.co'),
};

const ALL_PROBES = [CONTROL, ...LOOKALIKES, ...CASE_VARIANTS, ...WRONG_SIGN_IN, CLAIM_SPOOF];
const probeDb = (probe: Probe) => clientFor(env, clients, `probe:${probe.uid}`, probe.uid, probe.token).firestore();
const subjectDb = (key: SubjectKey) => subjectClient(env, clients, key).firestore();
const personOf = (key: SubjectKey) => SUBJECTS[key].access!.person_id;

beforeAll(async () => {
  env = await startRulesEnvironment();
  const probes = new Map<string, object>();
  for (const probe of ALL_PROBES) if (probe.access !== undefined) probes.set(`access/${probe.uid}`, probe.access);
  await seed(env, probes);
});

afterAll(async () => {
  await env?.cleanup();
});

describe('exact corporate e-mail: verified Google sign-in @tdfb.co only', () => {
  it('control: an exact verified @tdfb.co Google account with an enabled access document reads summaries', async () => {
    await assertSucceeds(probeDb(CONTROL).doc(`request_summaries/${GENERAL_REQUEST_ID}`).get());
    await assertSucceeds(probeDb(CONTROL).collection('request_summaries').limit(MAX_LIST_LIMIT).get());
  });

  it.each(CASE_VARIANTS.map((probe) => [probe.name, probe] as const))('D-S10-5: %s is the same corporate domain and is accepted', async (_name, probe) => {
    const db = probeDb(probe);
    await assertSucceeds(db.doc(`request_summaries/${GENERAL_REQUEST_ID}`).get());
    await assertSucceeds(db.collection('request_summaries').limit(MAX_LIST_LIMIT).get());
    await assertSucceeds(db.doc(`access/${probe.uid}`).get());
  });

  it.each(LOOKALIKES.map((probe) => [probe.name, probe] as const))('lookalike %s is denied even with an enabled access document', async (_name, probe) => {
    const db = probeDb(probe);
    await assertFails(db.doc(`request_summaries/${GENERAL_REQUEST_ID}`).get());
    await assertFails(db.collection('request_summaries').limit(MAX_LIST_LIMIT).get());
    await assertFails(db.doc(`access/${probe.uid}`).get());
  });

  it.each(WRONG_SIGN_IN.map((probe) => [probe.name, probe] as const))('%s is denied', async (_name, probe) => {
    const db = probeDb(probe);
    await assertFails(db.doc(`request_summaries/${GENERAL_REQUEST_ID}`).get());
    await assertFails(db.collection('gm_profile_summaries').limit(MAX_LIST_LIMIT).get());
  });

  it('a role claim in the token does not make a requester GM (the access document decides)', async () => {
    const db = probeDb(CLAIM_SPOOF);
    await assertSucceeds(db.doc(`request_summaries/${GENERAL_REQUEST_ID}`).get());
    await assertFails(db.collection('gm_request_summaries').limit(MAX_LIST_LIMIT).get());
    await assertFails(db.doc(`requests/${GENERAL_REQUEST_ID}`).get());
    await assertFails(db.collection('people_picker').limit(MAX_LIST_LIMIT).get());
  });
});

describe('queries on requests: GM only, even when a non-GM filters to their own requests', () => {
  const NON_GM_QUERIES: readonly (readonly [SubjectKey, string, (db: ReturnType<typeof subjectDb>) => Promise<unknown>])[] = [
    ['requester', 'requester_id == me', (db) => db.collection('requests').where('requester_id', '==', personOf('requester')).get()],
    ['requester', 'requester_id == me, limit 1', (db) => db.collection('requests').where('requester_id', '==', personOf('requester')).limit(1).get()],
    ['related_person', 'related_person_ids array-contains me', (db) => db.collection('requests').where('related_person_ids', 'array-contains', personOf('related_person')).get()],
    ['viewer_related', 'confidential_grant_ids array-contains me', (db) => db.collection('requests').where('confidential_grant_ids', 'array-contains', personOf('viewer_related')).get()],
    ['waiting_party', 'waiting_on.person_id == me', (db) => db.collection('requests').where('waiting_on.person_id', '==', personOf('waiting_party')).get()],
    ['employee', 'status == waiting', (db) => db.collection('requests').where('status', '==', 'waiting').get()],
  ];

  it.each(NON_GM_QUERIES.map(([key, name, run]) => [`${key}: ${name}`, key, run] as const))('%s → denied', async (_name, key, run) => {
    await assertFails(run(subjectDb(key)));
  });

  it('the same filtered query works for GM Staff and GM Admin', async () => {
    for (const key of ['gm_staff', 'gm_admin'] as const) {
      const result = await assertSucceeds(
        subjectDb(key).collection('requests').where('requester_id', '==', personOf('requester')).limit(MAX_LIST_LIMIT).get(),
      );
      expect(result.size).toBe(2);
    }
  });

  it('a non-GM still opens their own request by ID (get)', async () => {
    await assertSucceeds(subjectDb('requester').doc(`requests/${GENERAL_REQUEST_ID}`).get());
    await assertSucceeds(subjectDb('requester').doc(`requests/${SECRET_REQUEST_ID}`).get());
  });
});

describe('client writes to summaries and access are denied (role escalation, self-provisioning)', () => {
  it('a requester cannot raise their own role or re-enable themselves', async () => {
    const own = SUBJECTS.requester.auth!.uid;
    await assertFails(subjectDb('requester').doc(`access/${own}`).update({ role: 'gm_admin' }));
    await assertFails(subjectDb('requester').doc(`access/${own}`).set({ person_id: personOf('requester'), role: 'gm_admin', enabled: true }));
    await assertFails(subjectDb('inactive').doc(`access/${SUBJECTS.inactive.auth!.uid}`).update({ enabled: true }));
  });

  it('an account without an access document cannot create one for itself', async () => {
    const probe = WRONG_SIGN_IN.find((candidate) => candidate.uid === 'uid-probe-no-access')!;
    await assertFails(probeDb(probe).doc(`access/${probe.uid}`).set({ person_id: 'probe.noaccess@tdfb.co', role: 'requester', enabled: true }));
  });

  it('nobody writes public summaries or the board counter, GM included', async () => {
    for (const key of ['requester', 'gm_staff', 'gm_admin'] as const) {
      const db = subjectDb(key);
      await assertFails(db.doc(`request_summaries/${GENERAL_REQUEST_ID}`).update({ status: 'completed' }));
      await assertFails(db.doc(`request_summaries/${SECRET_REQUEST_ID}`).set({ summary_title: 'เปิดเผยงานลับ' }));
      await assertFails(db.doc('board_counters/public').update({ internal_board_count: 0 }));
    }
  });
});

describe('bounded queries the screens run (pagination) match the Rules', () => {
  it('public board: open summaries, ordered and limited, for every active account', async () => {
    for (const key of ['employee', 'viewer', 'watcher', 'gm_staff'] as const) {
      const page = await assertSucceeds(
        subjectDb(key).collection('request_summaries').where('status', 'in', ['queued', 'in_progress', 'waiting']).orderBy('last_updated_at', 'desc').limit(25).get(),
      );
      expect(page.docs.map((doc) => doc.id)).toEqual([GENERAL_REQUEST_ID]);
    }
  });

  it('GM board: GM summaries page for GM, denied for everyone else', async () => {
    const page = await assertSucceeds(subjectDb('gm_admin').collection('gm_request_summaries').orderBy('last_updated_at', 'desc').limit(25).get());
    expect(page.size).toBe(2);
    for (const key of ['requester', 'viewer', 'inactive'] as const) {
      await assertFails(subjectDb(key).collection('gm_request_summaries').orderBy('last_updated_at', 'desc').limit(25).get());
    }
  });

  it('my requests: only my own user_state page; another person’s is denied', async () => {
    await assertSucceeds(subjectDb('related_person').collection(`user_state/${personOf('related_person')}/requests`).limit(25).get());
    await assertFails(subjectDb('related_person').collection(`user_state/${personOf('requester')}/requests`).limit(25).get());
  });

  it('a collection-group query over every user_state is denied', async () => {
    await assertFails(subjectDb('requester').collectionGroup('requests').limit(25).get());
  });

  it('board_counters: the public document opens, a query over the collection does not (D-ACL-3)', async () => {
    await assertSucceeds(subjectDb('employee').doc('board_counters/public').get());
    await assertFails(subjectDb('employee').collection('board_counters').where('internal_board_count', '>=', 0).limit(1).get());
  });
});

describe('summaries carry only allowlisted fields', () => {
  it('what an employee reads from request_summaries is a subset of the public allowlist', async () => {
    const snapshot = await assertSucceeds(subjectDb('employee').collection('request_summaries').limit(MAX_LIST_LIMIT).get());
    expect(snapshot.size).toBe(1);
    for (const doc of snapshot.docs) {
      for (const field of Object.keys(doc.data())) expect(REQUEST_SUMMARY_FIELDS as readonly string[]).toContain(field);
    }
  });

  it('a confidential request has no summary document to read', async () => {
    const snapshot = await assertSucceeds(subjectDb('employee').doc(`request_summaries/${SECRET_REQUEST_ID}`).get());
    expect(snapshot.exists).toBe(false);
  });
});

describe('D-S10-4: every list query is bounded — no limit or a limit above 200 is refused', () => {
  const LISTS: readonly (readonly [SubjectKey, string])[] = [
    ['employee', 'request_summaries'],
    ['employee', 'gm_profile_summaries'],
    ['employee', 'locations'],
    ['employee', `user_state/${personOf('employee')}/requests`],
    ['gm_staff', 'gm_request_summaries'],
    ['gm_staff', 'requests'],
    ['gm_staff', 'people_picker'],
    ['gm_admin', 'renewal_items'],
  ];

  it.each(LISTS.map(([key, path]) => [`${key}: ${path}`, key, path] as const))('%s — no limit → denied', async (_name, key, path) => {
    await assertFails(subjectDb(key).collection(path).get());
  });

  it.each(LISTS.map(([key, path]) => [`${key}: ${path}`, key, path] as const))('%s — limit 201 → denied', async (_name, key, path) => {
    await assertFails(subjectDb(key).collection(path).limit(MAX_LIST_LIMIT + 1).get());
  });

  it.each(LISTS.map(([key, path]) => [`${key}: ${path}`, key, path] as const))('%s — limit 200 and a page of 50 → allowed', async (_name, key, path) => {
    await assertSucceeds(subjectDb(key).collection(path).limit(MAX_LIST_LIMIT).get());
    await assertSucceeds(subjectDb(key).collection(path).limit(50).get());
  });

  it('opening one document (get) needs no limit', async () => {
    await assertSucceeds(subjectDb('employee').doc(`request_summaries/${GENERAL_REQUEST_ID}`).get());
    await assertSucceeds(subjectDb('gm_staff').doc(`requests/${GENERAL_REQUEST_ID}`).get());
  });
});

