// S11 — Rules for restricted data and request children (Part 6 §6.4/§6.5, C3, C4, U1, D-ACL-2,
// FU-03). Access changes are made the way the API will make them — the domain command computes the
// new state and the documents are rewritten (Admin, Rules bypassed) — and the very next client read
// must follow the new state: no cached ACL, no grace period. Emulator only (demo-* project).
import { assertFails, assertSucceeds, type RulesTestContext, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { MAX_LIST_LIMIT, buildRequestProjections, type RequestRecord } from '@gm/contracts';
import { markConfidential, removeConfidentialFlag, removeRelatedPerson, type Actor } from '@gm/domain';
import { snapshotCalendar } from '@gm/time';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  GENERAL_REQUEST_ID,
  RESOURCES,
  SAMPLE_REQUESTS,
  SECRET_REQUEST_ID,
  SUBJECTS,
  SUBJECT_KEYS,
  decide,
  type AclSubject,
  type SubjectKey,
} from './fixtures/acl-matrix';
import { clientFor, startRulesEnvironment, subjectClient } from './support/rules-env';

let env: RulesTestEnvironment;
const clients = new Map<string, RulesTestContext>();

const GM: Actor = { personId: SUBJECTS.gm_staff.access!.person_id, role: 'gm_staff' };
const GM_ADMIN: Actor = { personId: SUBJECTS.gm_admin.access!.person_id, role: 'gm_admin' };
const personOf = (key: SubjectKey) => SUBJECTS[key].access!.person_id;
const db = (key: SubjectKey) => subjectClient(env, clients, key).firestore();
const T1 = Date.parse('2026-12-29T10:00:00+07:00');
const COMPANY = snapshotCalendar({ timeZone: 'Asia/Bangkok', openWeekdays: [1, 2, 3, 4, 5], holidays: [] });

/** Writes every stored layer of a request as the API would (Admin SDK, Rules bypassed). */
async function writeRequest(id: string, record: RequestRecord): Promise<void> {
  const projections = buildRequestProjections(id, record, {
    now: T1,
    workCalendar: COMPANY,
    personLabel: (personId) => (personId === GM.personId ? 'คุณ GM ตัวอย่าง' : undefined),
    personTeamLabel: () => undefined,
  });
  await env.withSecurityRulesDisabled(async (admin) => {
    const store = admin.firestore();
    await store.doc(`requests/${id}`).set(projections.detail);
    await store.doc(`gm_request_details/${id}`).set(projections.gmDetail);
    if (projections.public === null) await store.doc(`request_summaries/${id}`).delete();
    else await store.doc(`request_summaries/${id}`).set(projections.public);
  });
}

/** The ACL part of a stored request as the domain commands see it. */
function aclState(record: RequestRecord) {
  return {
    source: record.source,
    type: record.type,
    isConfidential: record.is_confidential,
    ...(record.requester_id === undefined ? {} : { requesterId: record.requester_id }),
    relatedPersonIds: record.related_person_ids,
    ...(record.confidential_grant_ids === undefined ? {} : { confidentialGrantIds: record.confidential_grant_ids }),
    ...(record.sensitivity_reason === undefined ? {} : { sensitivityReason: record.sensitivity_reason }),
    ...(record.sensitivity_note === undefined ? {} : { sensitivityNote: record.sensitivity_note }),
    lastUpdatedAt: record.last_updated_at,
  };
}

/** The request after a domain command changed its ACL fields. */
function withAcl(record: RequestRecord, state: ReturnType<typeof aclState>): RequestRecord {
  const {
    confidential_grant_ids: _grants,
    sensitivity_reason: _reason,
    sensitivity_note: _note,
    ...rest
  } = record;
  return {
    ...rest,
    is_confidential: state.isConfidential,
    related_person_ids: state.relatedPersonIds,
    ...(state.confidentialGrantIds === undefined ? {} : { confidential_grant_ids: state.confidentialGrantIds }),
    ...(state.sensitivityReason === undefined ? {} : { sensitivity_reason: state.sensitivityReason }),
    ...(state.sensitivityNote === undefined ? {} : { sensitivity_note: state.sensitivityNote }),
    last_updated_at: state.lastUpdatedAt,
  };
}

let next = 0;
/** A fresh copy of a sample request, so each case changes its own document. */
async function freshCopy(sampleId: string): Promise<{ id: string; record: RequestRecord }> {
  const id = `req-s11-${String(++next).padStart(3, '0')}`;
  const record = SAMPLE_REQUESTS[sampleId]!;
  await writeRequest(id, record);
  return { id, record };
}

const DETAIL = (id: string) => `requests/${id}`;

beforeAll(async () => {
  env = await startRulesEnvironment();
});

afterAll(async () => {
  await env?.cleanup();
});

describe('S11: removing a related person (FU-03) takes effect on the very next read', () => {
  it('general request: the removed person is refused at once; others keep reading', async () => {
    const { id, record } = await freshCopy(GENERAL_REQUEST_ID);
    await assertSucceeds(db('related_person').doc(DETAIL(id)).get());
    const { state } = removeRelatedPerson(aclState(record), { actor: GM, now: T1, personId: personOf('related_person') });
    await writeRequest(id, withAcl(record, state));
    await assertFails(db('related_person').doc(DETAIL(id)).get());
    await assertSucceeds(db('waiting_party').doc(DETAIL(id)).get());
    await assertSucceeds(db('requester').doc(DETAIL(id)).get());
    // The public summary is still there for everyone (U1): removal only takes the detail away.
    await assertSucceeds(db('related_person').doc(`request_summaries/${id}`).get());
  });

  it('confidential request: the grant goes with them, so they are refused at once', async () => {
    const { id, record } = await freshCopy(SECRET_REQUEST_ID);
    await assertSucceeds(db('viewer_related').doc(DETAIL(id)).get());
    const { state } = removeRelatedPerson(aclState(record), { actor: GM_ADMIN, now: T1, personId: personOf('viewer_related') });
    expect(state.confidentialGrantIds).not.toContain(personOf('viewer_related'));
    await writeRequest(id, withAcl(record, state));
    await assertFails(db('viewer_related').doc(DETAIL(id)).get());
    await assertSucceeds(db('related_person').doc(DETAIL(id)).get());
  });
});

describe('S11: flagging a request confidential later (D-ACL-2) withdraws everyone not kept, at once', () => {
  it('keeping nobody: every related person is refused on the next read; the requester and GM still read', async () => {
    const { id, record } = await freshCopy(GENERAL_REQUEST_ID);
    const related: readonly SubjectKey[] = ['related_person', 'related_unconfirmed', 'waiting_party', 'viewer_related', 'viewer_unconfirmed'];
    for (const key of related) await assertSucceeds(db(key).doc(DETAIL(id)).get());
    const general = { ...aclState(record), type: 'document_request' as const };
    const { state } = markConfidential(general, { actor: GM, now: T1, sensitivityReason: 'personnel', keepRelatedPersonIds: [] });
    await writeRequest(id, withAcl({ ...record, type: 'document_request' }, state));
    for (const key of related) await assertFails(db(key).doc(DETAIL(id)).get());
    await assertSucceeds(db('requester').doc(DETAIL(id)).get());
    await assertSucceeds(db('gm_staff').doc(DETAIL(id)).get());
    // They stay listed as related, but only GM sees the confidential request at all now.
    const stored = await assertSucceeds(db('gm_admin').doc(DETAIL(id)).get());
    expect(stored.data()?.related_person_ids).toContain(personOf('related_person'));
  });

  it('a kept person keeps reading; the public summary is gone for everyone (watchers included)', async () => {
    const { id, record } = await freshCopy(GENERAL_REQUEST_ID);
    await assertSucceeds(db('watcher').doc(`request_summaries/${id}`).get());
    const general = { ...aclState(record), type: 'document_request' as const };
    const { state } = markConfidential(general, {
      actor: GM,
      now: T1,
      sensitivityReason: 'personnel',
      keepRelatedPersonIds: [personOf('waiting_party')],
    });
    await writeRequest(id, withAcl({ ...record, type: 'document_request' }, state));
    await assertSucceeds(db('waiting_party').doc(DETAIL(id)).get());
    await assertFails(db('related_person').doc(DETAIL(id)).get());
    const summary = await assertSucceeds(db('watcher').doc(`request_summaries/${id}`).get());
    expect(summary.exists).toBe(false);
  });
});

describe('S11: removing the confidential flag gives related persons their normal access back', () => {
  it('GM Admin unflags: every related person reads the (now general) request again; non-related still cannot', async () => {
    const { id, record } = await freshCopy(SECRET_REQUEST_ID);
    for (const key of ['related_unconfirmed', 'viewer_unconfirmed'] as const) await assertFails(db(key).doc(DETAIL(id)).get());
    const { state } = removeConfidentialFlag(aclState(record), { actor: GM_ADMIN, now: T1, reason: 'เรื่องจบแล้ว ไม่มีข้อมูลอ่อนไหว' });
    expect(state).not.toHaveProperty('confidentialGrantIds');
    await writeRequest(id, withAcl(record, state));
    for (const key of ['related_person', 'related_unconfirmed', 'waiting_party', 'viewer_related', 'viewer_unconfirmed'] as const) {
      await assertSucceeds(db(key).doc(DETAIL(id)).get());
    }
    for (const key of ['employee', 'viewer', 'watcher', 'team_label_member'] as const) await assertFails(db(key).doc(DETAIL(id)).get());
    // The public summary comes back with the next write.
    await assertSucceeds(db('employee').doc(`request_summaries/${id}`).get());
  });
});

describe('S11: watchers and team labels alone never open the restricted layer', () => {
  it.each([GENERAL_REQUEST_ID, SECRET_REQUEST_ID])('%s: watcher and team-label member are refused; the summary stays open for them', async (requestId) => {
    for (const key of ['watcher', 'team_label_member'] as const) {
      await assertFails(db(key).doc(DETAIL(requestId)).get());
      await assertFails(db(key).doc(`gm_request_details/${requestId}`).get());
    }
    if (requestId === GENERAL_REQUEST_ID) await assertSucceeds(db('watcher').doc(`request_summaries/${requestId}`).get());
  });
});

const CHILDREN = ['history', 'comments', 'gm_history', 'waiting_intervals'] as const;
const CHILD_DOC: Record<(typeof CHILDREN)[number], string> = {
  history: 'history/evt-1',
  comments: 'comments/cmt-1',
  gm_history: 'gm_history/gmh-1',
  waiting_intervals: 'waiting_intervals/1',
};

describe('S11: history, comments, gm_history and waiting intervals are API-only for every role', () => {
  describe.each(SUBJECT_KEYS)('%s', (key) => {
    it.each(CHILDREN)('%s: get, bounded list and collection-group query are refused', async (child) => {
      for (const requestId of [GENERAL_REQUEST_ID, SECRET_REQUEST_ID]) {
        await assertFails(db(key).doc(`requests/${requestId}/${CHILD_DOC[child]}`).get());
        await assertFails(db(key).collection(`requests/${requestId}/${child}`).limit(MAX_LIST_LIMIT).get());
      }
      await assertFails(db(key).collectionGroup(child).limit(MAX_LIST_LIMIT).get());
    });
  });

  it('control: the child documents exist (the refusals come from Rules)', async () => {
    await env.withSecurityRulesDisabled(async (admin) => {
      for (const child of CHILDREN) {
        expect((await admin.firestore().doc(`requests/${GENERAL_REQUEST_ID}/${CHILD_DOC[child]}`).get()).exists).toBe(true);
      }
    });
  });
});

describe('S11: an account disabled mid-session reads nothing on its next request except its own access', () => {
  const uid = 'uid-s11-midway';
  const person = personOf('related_person');
  const token = { email: person, email_verified: true, firebase: { sign_in_provider: 'google.com' as const } };
  /** The same person as `related_person`, signed in on another account, so the shared fixture is untouched. */
  const midway: AclSubject = { key: 'related_person', description: 'disabled mid-session', auth: { uid, token }, access: { person_id: person, role: 'requester', enabled: true } };
  const resolve = (path: string | ((subject: AclSubject) => string)) => (typeof path === 'string' ? path : path(midway));
  const reads = RESOURCES.flatMap((resource) =>
    (['get', 'list'] as const).map((operation) => ({
      resource,
      operation,
      path: resolve(operation === 'list' ? resource.collectionPath : resource.path),
      before: decide('related_person', resource.key, operation),
    })),
  );
  const run = (client: ReturnType<typeof clientFor>, operation: 'get' | 'list', path: string): Promise<unknown> =>
    operation === 'get' ? client.firestore().doc(path).get() : client.firestore().collection(path).limit(MAX_LIST_LIMIT).get();

  it('before: reads what a related person may read; after enabled=false: only access/{own uid}', async () => {
    await env.withSecurityRulesDisabled(async (admin) => {
      await admin.firestore().doc(`access/${uid}`).set(midway.access!);
    });
    const client = clientFor(env, clients, 'probe:midway', uid, token);
    for (const read of reads) {
      const attempt = run(client, read.operation, read.path);
      if (read.before === 'allow') await assertSucceeds(attempt);
      else await assertFails(attempt);
    }
    await env.withSecurityRulesDisabled(async (admin) => {
      await admin.firestore().doc(`access/${uid}`).update({ enabled: false });
    });
    for (const read of reads) {
      const attempt = run(client, read.operation, read.path);
      if (read.resource.key === 'access.self' && read.operation === 'get') await assertSucceeds(attempt);
      else await assertFails(attempt);
    }
    expect(reads.filter((read) => read.before === 'allow').length).toBeGreaterThan(10);
  });
});
