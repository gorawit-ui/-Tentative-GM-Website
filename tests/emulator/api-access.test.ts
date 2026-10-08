// S12 — API authorization on the emulators (Part 6 §6.5/§6.10, D-S10-3, U1). The API uses the Admin
// SDK and so bypasses Rules: every read/file endpoint checks access itself. The same ACL matrix
// subjects and sample requests as the Rules tests; the expected result of every subject × endpoint
// comes from tests/rules/fixtures/api-matrix.ts. Logs are captured for the whole file and searched
// for e-mails, names, typed details, signed URLs and tokens at the end. Emulators only (demo-*).
import {
  MAX_ATTACHMENT_BYTES,
  MAX_PHOTOS_PER_SUBMISSION,
  UPLOAD_URL_TTL_SECONDS,
  VIEW_URL_TTL_SECONDS,
  type RequestRecord,
} from '@gm/contracts';
import { canReadRequestDetail } from '@gm/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ApiError,
  countAwaitingConfirmation,
  createUploadUrl,
  createViewUrl,
  finalizeUpload,
  getRequestDetail,
  listComments,
  listHistory,
  listWaitingIntervals,
  listMyRequests,
  markSeen,
  previewRelated,
  previewWaiting,
} from '../../apps/api/src/endpoints/index';
import { GENERAL_REQUEST_ID, SAMPLE_REQUESTS, SECRET_REQUEST_ID, SUBJECTS, SUBJECT_KEYS, accessViewerOf, seedDocuments, type SubjectKey } from '../rules/fixtures/acl-matrix';
import { API_ENDPOINTS, apiCells, type ApiEndpoint } from '../rules/fixtures/api-matrix';
import { blockedHosts } from '../rules/network-guard';
import { apiHarness, captureLogs, clearAuth, type ApiHarness, type LogCapture } from './support/api-harness';
import { clearFirestore } from './support/firestore-client-store';

/** `requests/{id}/attachments/{attachment}` (Part 6 §6.10 object layout). */
const pathOf = (requestId: string, attachmentId: string) => `requests/${requestId}/attachments/${attachmentId}`;
const NOW = Date.parse('2026-12-29T10:00:00+07:00');
const ATTACHMENT = 'att-acl-1';
const AWAITING_ID = 'req-s12-awaiting';
const CLOSED_ID = 'req-s12-closed';
const CANCELLED_ID = 'req-s12-cancelled';
const CLOSING_ID = 'req-s12-closing';
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

let harness: ApiHarness;
let logs: LogCapture;
const tokens = new Map<SubjectKey, string | undefined>();
const issued: string[] = [];
const personOf = (key: SubjectKey) => SUBJECTS[key].access!.person_id;

type Relation = 'requester' | 'related' | 'watcher';
/** Realistic “my requests” references; every other subject keeps the fixture's stale requester row. */
const RELATIONS: Partial<Record<SubjectKey, readonly (readonly [string, Relation])[]>> = {
  requester: [
    [GENERAL_REQUEST_ID, 'requester'],
    [SECRET_REQUEST_ID, 'requester'],
    [AWAITING_ID, 'requester'],
    [CLOSED_ID, 'requester'],
  ],
  related_person: [
    [GENERAL_REQUEST_ID, 'related'],
    [SECRET_REQUEST_ID, 'related'],
  ],
  related_unconfirmed: [
    [GENERAL_REQUEST_ID, 'related'],
    [SECRET_REQUEST_ID, 'related'],
  ],
  waiting_party: [
    [GENERAL_REQUEST_ID, 'related'],
    [SECRET_REQUEST_ID, 'related'],
  ],
  viewer_related: [
    [GENERAL_REQUEST_ID, 'related'],
    [SECRET_REQUEST_ID, 'related'],
  ],
  viewer_unconfirmed: [
    [GENERAL_REQUEST_ID, 'related'],
    [SECRET_REQUEST_ID, 'related'],
  ],
  watcher: [[GENERAL_REQUEST_ID, 'watcher']],
};

const EXTRA_REQUESTS: Readonly<Record<string, RequestRecord>> = {
  [AWAITING_ID]: { ...SAMPLE_REQUESTS[GENERAL_REQUEST_ID]!, request_number: 'DEV-0903', status: 'completed', completed_at: NOW - 3_600_000, completion_cycle_id: 1 },
  [CLOSED_ID]: {
    ...SAMPLE_REQUESTS[GENERAL_REQUEST_ID]!,
    request_number: 'DEV-0904',
    status: 'completed',
    completed_at: NOW - 7_200_000,
    closed_at: NOW - 3_600_000,
    closure_kind: 'requester_confirmed',
    completion_cycle_id: 1,
  },
};
const ALL_REQUESTS: Readonly<Record<string, RequestRecord>> = { ...SAMPLE_REQUESTS, ...EXTRA_REQUESTS };
const LATE_REQUESTS: Readonly<Record<string, RequestRecord>> = {
  [CANCELLED_ID]: { ...SAMPLE_REQUESTS[GENERAL_REQUEST_ID]!, request_number: 'DEV-0905', status: 'cancelled', cancelled_at: NOW - 3_600_000 },
  [CLOSING_ID]: { ...SAMPLE_REQUESTS[GENERAL_REQUEST_ID]!, request_number: 'DEV-0906' },
};

function relationsOf(key: SubjectKey): readonly (readonly [string, Relation])[] {
  return RELATIONS[key] ?? [[GENERAL_REQUEST_ID, 'requester']];
}

const factsOf = (record: RequestRecord) => ({
  requesterId: record.requester_id,
  relatedPersonIds: record.related_person_ids,
  isConfidential: record.is_confidential,
  confidentialGrantIds: record.confidential_grant_ids,
});

/** What “my requests” must return: only references whose relation still holds and that the person may use now. */
function expectedMyRequests(key: SubjectKey): string[] {
  const viewer = accessViewerOf(key);
  const person = personOf(key);
  return relationsOf(key)
    .filter(([requestId, relation]) => {
      const record = ALL_REQUESTS[requestId]!;
      if (relation === 'requester') return record.requester_id === person;
      if (relation === 'related') return record.related_person_ids.includes(person) && canReadRequestDetail(viewer, factsOf(record));
      return record.watcher_ids.includes(person) && !record.is_confidential;
    })
    .map(([requestId, relation]) => `${requestId}:${relation}`)
    .sort();
}

async function seed(): Promise<void> {
  await clearFirestore();
  await clearAuth();
  const batch = harness.db.batch();
  for (const [path, data] of seedDocuments()) batch.set(harness.db.doc(path), data);
  for (const [id, record] of Object.entries({ ...EXTRA_REQUESTS, ...LATE_REQUESTS })) {
    const { watcher_ids: _watchers, sensitivity_note: _note, ...detail } = record;
    batch.set(harness.db.doc(`requests/${id}`), detail);
    batch.set(harness.db.doc(`gm_request_details/${id}`), { watcher_ids: record.watcher_ids });
  }
  for (const key of SUBJECT_KEYS) {
    const person = SUBJECTS[key].access?.person_id;
    if (person === undefined) continue;
    for (const [requestId, relation] of relationsOf(key)) {
      batch.set(harness.db.doc(`user_state/${person}/requests/${requestId}`), { type: relation, last_seen_activity_seq: 0 });
    }
  }
  await batch.commit();
  for (const requestId of [GENERAL_REQUEST_ID, SECRET_REQUEST_ID]) {
    await harness.bucket.file(pathOf(requestId, ATTACHMENT)).save(JPEG, { contentType: 'image/jpeg' });
  }
}

/** Signs every subject in through the Auth emulator and stores its access document under the new uid. */
async function signInSubjects(): Promise<void> {
  for (const key of SUBJECT_KEYS) {
    const { auth, access } = SUBJECTS[key];
    if (auth === null) {
      tokens.set(key, undefined);
      continue;
    }
    const signedIn = await harness.signIn(auth.token.email, auth.token.email_verified);
    if (access !== undefined) await harness.db.doc(`access/${signedIn.uid}`).set(access);
    tokens.set(key, signedIn.idToken);
    issued.push(signedIn.idToken);
  }
}

async function call(endpoint: ApiEndpoint, token: string | undefined): Promise<unknown> {
  const requestId = endpoint.requestId ?? GENERAL_REQUEST_ID;
  const { deps } = harness;
  switch (endpoint.kind) {
    case 'request_detail':
      return getRequestDetail(deps, token, requestId);
    case 'history':
      return listHistory(deps, token, requestId);
    case 'waiting_intervals':
      return listWaitingIntervals(deps, token, requestId);
    case 'comments':
      return listComments(deps, token, requestId);
    case 'my_requests':
      return listMyRequests(deps, token);
    case 'awaiting_confirmation':
      return countAwaitingConfirmation(deps, token);
    case 'view_url':
      return createViewUrl(deps, token, { requestId, objectPath: pathOf(requestId, ATTACHMENT) });
    case 'upload_url.attachment':
      return createUploadUrl(deps, token, { requestId, purpose: 'attachment', contentType: 'image/jpeg', sizeBytes: 300_000 });
    case 'upload_url.watch_contribution':
      return createUploadUrl(deps, token, { requestId, purpose: 'watch_contribution', contentType: 'image/jpeg', sizeBytes: 300_000 });
    case 'mark_seen':
      return markSeen(deps, token, requestId, { activitySeq: 0 });
    case 'waiting_preview':
      return previewWaiting(deps, token, requestId, { waiting_on: { kind: 'government', name: 'สำนักงานเขตตัวอย่าง' } });
    case 'related_preview':
      return previewRelated(deps, token, requestId, { person_ids: [] });
  }
}

async function refusal(promise: Promise<unknown>): Promise<{ status: number; code: string }> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) return { status: error.status, code: error.code };
    throw error;
  }
  throw new Error('expected the API to refuse');
}

function remember<T extends { url?: string }>(value: T): T {
  if (value.url !== undefined) issued.push(value.url);
  return value;
}

const expiresSeconds = (url: string) => new URL(url).searchParams.get('X-Goog-Expires');

beforeAll(async () => {
  logs = captureLogs();
  harness = apiHarness(NOW);
  await seed();
  await signInSubjects();
});

afterAll(async () => {
  logs?.stop();
  await harness?.close();
});

describe('every subject × every read/file endpoint matches the API matrix', () => {
  describe.each(SUBJECT_KEYS)('%s', (key) => {
    it.each(apiCells().filter((cell) => cell.subject === key).map((cell) => [`${cell.endpoint.key} → ${cell.expected}`, cell] as const))(
      '%s',
      async (_label, cell) => {
        const attempt = call(cell.endpoint, tokens.get(key));
        if (cell.expected === 'deny') {
          const refused = await refusal(attempt);
          expect([401, 403, 404]).toContain(refused.status);
          return;
        }
        const result = (await attempt) as Record<string, unknown> & { url?: string };
        remember(result);
        switch (cell.endpoint.kind) {
          case 'request_detail':
            expect(result.request_id).toBe(cell.endpoint.requestId);
            expect(result).not.toHaveProperty('watcher_ids');
            expect(result).not.toHaveProperty('sensitivity_note');
            break;
          case 'history':
          case 'waiting_intervals':
          case 'comments':
            expect(result).toHaveLength(1);
            break;
          case 'my_requests':
            expect((result as unknown as { request_id: string; relation: string }[]).map((card) => `${card.request_id}:${card.relation}`).sort()).toEqual(
              expectedMyRequests(key),
            );
            break;
          case 'awaiting_confirmation':
            expect(result).toEqual({ count: key === 'requester' ? 1 : 0 });
            break;
          case 'view_url':
            expect(result.url).toContain(pathOf(cell.endpoint.requestId!, ATTACHMENT));
            expect(expiresSeconds(result.url!)).toBe(String(VIEW_URL_TTL_SECONDS));
            expect(result.expires_at).toBe(NOW + VIEW_URL_TTL_SECONDS * 1000);
            break;
          case 'mark_seen':
            expect(result).toMatchObject({ last_seen_activity_seq: 0 });
            break;
          case 'waiting_preview':
            expect(result).toMatchObject({ recipients: [], new_related_person_ids: [], needs_confidential_grant: false });
            break;
          case 'related_preview':
            expect(result).toMatchObject({ people: [], new_related_person_ids: [], needs_confidential_grant: false });
            break;
          case 'upload_url.attachment':
          case 'upload_url.watch_contribution':
            expect(result.url).toContain(`pending/${String(result.upload_id)}`);
            expect(expiresSeconds(result.url!)).toBe(String(UPLOAD_URL_TTL_SECONDS));
            expect(result.method).toBe('PUT');
            break;
        }
      },
    );
  });

  it('covers every endpoint of the matrix', () => {
    expect(new Set(API_ENDPOINTS.map((endpoint) => endpoint.kind)).size).toBe(12);
  });
});

describe('view links: only for an attachment of that request, never a crafted path', () => {
  const requester = () => tokens.get('requester');

  it.each([
    ['another request’s attachment', GENERAL_REQUEST_ID, pathOf(SECRET_REQUEST_ID, ATTACHMENT), 404],
    ['a path with ../', GENERAL_REQUEST_ID, `requests/${GENERAL_REQUEST_ID}/attachments/../../${SECRET_REQUEST_ID}/attachments/${ATTACHMENT}`, 400],
    ['a path that ends in ..', GENERAL_REQUEST_ID, `requests/${GENERAL_REQUEST_ID}/attachments/..`, 400],
    ['an encoded ../', GENERAL_REQUEST_ID, `requests/${GENERAL_REQUEST_ID}/attachments/%2e%2e%2fatt`, 400],
    ['a pending upload', GENERAL_REQUEST_ID, 'pending/up-someone', 400],
    ['a watcher contribution', GENERAL_REQUEST_ID, `contributions/${GENERAL_REQUEST_ID}/up-someone`, 400],
    ['an attachment not on the request', GENERAL_REQUEST_ID, pathOf(GENERAL_REQUEST_ID, 'att-not-listed'), 404],
  ])('%s is refused', async (_label, requestId, objectPath, status) => {
    expect((await refusal(createViewUrl(harness.deps, requester(), { requestId, objectPath }))).status).toBe(status);
  });

  it('a GM asking about a request the path does not belong to is refused too', async () => {
    const refused = await refusal(
      createViewUrl(harness.deps, tokens.get('gm_admin'), { requestId: GENERAL_REQUEST_ID, objectPath: pathOf(SECRET_REQUEST_ID, ATTACHMENT) }),
    );
    expect(refused.status).toBe(404);
  });
});

describe('upload links: images only, size within the cap, 15 minutes, bound to the request', () => {
  const upload = (key: SubjectKey, input: Partial<Parameters<typeof createUploadUrl>[2]> = {}) =>
    createUploadUrl(harness.deps, tokens.get(key), { requestId: GENERAL_REQUEST_ID, purpose: 'attachment', contentType: 'image/jpeg', sizeBytes: 300_000, ...input });

  it.each(['image/svg+xml', 'application/pdf', 'text/html', 'image/gif', ''])('content type %j is refused', async (contentType) => {
    expect(await refusal(upload('requester', { contentType }))).toEqual({ status: 400, code: 'CONTENT_TYPE_NOT_ALLOWED' });
  });

  it.each([0, -1, 1.5, Number.NaN])('size %d is refused', async (sizeBytes) => {
    expect((await refusal(upload('requester', { sizeBytes }))).code).toBe('SIZE_INVALID');
  });

  it('a file above the cap is refused', async () => {
    expect(await refusal(upload('requester', { sizeBytes: MAX_ATTACHMENT_BYTES + 1 }))).toEqual({ status: 413, code: 'FILE_TOO_LARGE' });
  });

  it('a PUT link for an allowed image: 15 minutes, the content type and the size range are part of the signature', async () => {
    const result = remember(await upload('gm_staff', { contentType: 'image/png', sizeBytes: MAX_ATTACHMENT_BYTES }));
    const url = new URL(result.url);
    expect(url.searchParams.get('X-Goog-Expires')).toBe('900');
    expect(url.searchParams.get('X-Goog-SignedHeaders')).toContain('content-type');
    expect(url.searchParams.get('X-Goog-SignedHeaders')).toContain('x-goog-content-length-range');
    expect(result.headers).toEqual({ 'Content-Type': 'image/png', 'x-goog-content-length-range': `1,${MAX_ATTACHMENT_BYTES}` });
    expect(result.expires_at).toBe(NOW + 15 * 60 * 1000);
    const stored = (await harness.db.doc(`uploads/${result.upload_id}`).get()).data();
    expect(stored).toMatchObject({ request_id: GENERAL_REQUEST_ID, purpose: 'attachment', content_type: 'image/png', state: 'pending' });
  });

  it('a related person reads the request but may not attach (Q-S12-2); someone without access gets “not found”', async () => {
    expect(await refusal(upload('related_person'))).toEqual({ status: 403, code: 'ATTACH_NOT_ALLOWED' });
    expect(await refusal(upload('employee'))).toEqual({ status: 404, code: 'NOT_FOUND' });
  });

  it('an unknown request is “not found”', async () => {
    expect((await refusal(upload('gm_admin', { requestId: 'req-missing' }))).status).toBe(404);
  });
});

describe('finalize: only the person who asked for the link, only a real image within the cap', () => {
  async function pendingUpload(key: SubjectKey, purpose: 'attachment' | 'watch_contribution' = 'attachment', sizeBytes = JPEG.length) {
    const result = remember(
      await createUploadUrl(harness.deps, tokens.get(key), { requestId: GENERAL_REQUEST_ID, purpose, contentType: 'image/jpeg', sizeBytes }),
    );
    return result.upload_id;
  }

  it('the uploader finalizes a real JPEG; it moves out of pending', async () => {
    const uploadId = await pendingUpload('requester');
    await harness.bucket.file(`pending/${uploadId}`).save(JPEG, { contentType: 'image/jpeg' });
    const done = await finalizeUpload(harness.deps, tokens.get('requester'), { uploadId });
    expect(done).toEqual({ upload_id: uploadId, object_path: pathOf(GENERAL_REQUEST_ID, uploadId) });
    expect((await harness.bucket.file(`pending/${uploadId}`).exists())[0]).toBe(false);
    expect((await harness.db.doc(`uploads/${uploadId}`).get()).data()).toMatchObject({ state: 'finalized' });
  });

  it('someone else cannot finalize it (foreign upload ID → not found)', async () => {
    const uploadId = await pendingUpload('requester');
    await harness.bucket.file(`pending/${uploadId}`).save(JPEG, { contentType: 'image/jpeg' });
    expect((await refusal(finalizeUpload(harness.deps, tokens.get('gm_staff'), { uploadId }))).status).toBe(404);
    expect((await refusal(finalizeUpload(harness.deps, tokens.get('related_person'), { uploadId }))).status).toBe(404);
  });

  it('bytes that are not an image are refused and removed', async () => {
    const uploadId = await pendingUpload('requester', 'attachment', 64);
    await harness.bucket.file(`pending/${uploadId}`).save(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'), { contentType: 'image/jpeg' });
    expect(await refusal(finalizeUpload(harness.deps, tokens.get('requester'), { uploadId }))).toEqual({ status: 422, code: 'NOT_AN_IMAGE' });
    expect((await harness.bucket.file(`pending/${uploadId}`).exists())[0]).toBe(false);
  });

  it('a stored file larger than declared is refused', async () => {
    const uploadId = await pendingUpload('requester', 'attachment', 4);
    await harness.bucket.file(`pending/${uploadId}`).save(JPEG, { contentType: 'image/jpeg' });
    expect(await refusal(finalizeUpload(harness.deps, tokens.get('requester'), { uploadId }))).toEqual({ status: 413, code: 'FILE_TOO_LARGE' });
  });

  it('nothing uploaded yet → conflict; an expired upload → gone', async () => {
    const missing = await pendingUpload('requester');
    expect((await refusal(finalizeUpload(harness.deps, tokens.get('requester'), { uploadId: missing }))).code).toBe('UPLOAD_MISSING');
    const late = await pendingUpload('requester');
    await harness.bucket.file(`pending/${late}`).save(JPEG, { contentType: 'image/jpeg' });
    harness.setNow(NOW + 24 * 3_600_000 + 1);
    try {
      expect(await refusal(finalizeUpload(harness.deps, tokens.get('requester'), { uploadId: late }))).toEqual({ status: 410, code: 'UPLOAD_EXPIRED' });
    } finally {
      harness.setNow(NOW);
    }
  });
});

describe('watcher (U1): one contribution with a photo at watch time, but no view link to the request photos', () => {
  it('D-S12-3: one contribution with up to 3 photos; a 4th is refused; no view link to the request photos', async () => {
    const watcher = tokens.get('watcher');
    // Earlier cells left pending links; they expire after 24 h and stop counting.
    harness.setNow(NOW + 25 * 3_600_000);
    try {
      const paths: string[] = [];
      for (let photo = 0; photo < MAX_PHOTOS_PER_SUBMISSION; photo += 1) {
        const link = remember(
          await createUploadUrl(harness.deps, watcher, { requestId: GENERAL_REQUEST_ID, purpose: 'watch_contribution', contentType: 'image/jpeg', sizeBytes: JPEG.length }),
        );
        await harness.bucket.file(`pending/${link.upload_id}`).save(JPEG, { contentType: 'image/jpeg' });
        const done = await finalizeUpload(harness.deps, watcher, { uploadId: link.upload_id });
        expect(done.object_path).toBe(`contributions/${GENERAL_REQUEST_ID}/${link.upload_id}`);
        paths.push(done.object_path);
      }
      expect(
        await refusal(
          createUploadUrl(harness.deps, watcher, { requestId: GENERAL_REQUEST_ID, purpose: 'watch_contribution', contentType: 'image/jpeg', sizeBytes: JPEG.length }),
        ),
      ).toEqual({ status: 409, code: 'PHOTO_LIMIT_REACHED' });
      expect((await refusal(createViewUrl(harness.deps, watcher, { requestId: GENERAL_REQUEST_ID, objectPath: pathOf(GENERAL_REQUEST_ID, ATTACHMENT) }))).status).toBe(404);
      expect((await refusal(createViewUrl(harness.deps, watcher, { requestId: GENERAL_REQUEST_ID, objectPath: paths[0]! }))).status).toBe(400);
      expect((await refusal(getRequestDetail(harness.deps, watcher, GENERAL_REQUEST_ID))).status).toBe(404);
    } finally {
      harness.setNow(NOW);
    }
  });

  it('D-S12-3: pending links count toward the 3 photos until they expire', async () => {
    const watcher = await harness.signIn('acl.watcher.two@tdfb.co');
    issued.push(watcher.idToken);
    await harness.db.doc(`access/${watcher.uid}`).set({ person_id: 'acl.watcher.two@tdfb.co', role: 'requester', enabled: true });
    await harness.db.doc(`gm_request_details/${GENERAL_REQUEST_ID}`).update({ watcher_ids: [personOf('watcher'), 'acl.watcher.two@tdfb.co'] });
    const ask = () =>
      createUploadUrl(harness.deps, watcher.idToken, { requestId: GENERAL_REQUEST_ID, purpose: 'watch_contribution', contentType: 'image/jpeg', sizeBytes: JPEG.length });
    for (let photo = 0; photo < MAX_PHOTOS_PER_SUBMISSION; photo += 1) remember(await ask());
    expect((await refusal(ask())).code).toBe('PHOTO_LIMIT_REACHED');
    harness.setNow(NOW + 25 * 3_600_000);
    try {
      remember(await ask());
    } finally {
      harness.setNow(NOW);
    }
  });

  it('a contribution upload is for watchers only, and never on a confidential request', async () => {
    expect((await refusal(createUploadUrl(harness.deps, tokens.get('employee'), { requestId: GENERAL_REQUEST_ID, purpose: 'watch_contribution', contentType: 'image/jpeg', sizeBytes: 10 }))).status).toBe(403);
    expect((await refusal(createUploadUrl(harness.deps, tokens.get('watcher'), { requestId: SECRET_REQUEST_ID, purpose: 'watch_contribution', contentType: 'image/jpeg', sizeBytes: 10 }))).status).toBe(404);
  });
});

describe('D-S12-4: photos only on requests that are not closed or cancelled', () => {
  const upload = (requestId: string) =>
    createUploadUrl(harness.deps, tokens.get('requester'), { requestId, purpose: 'attachment', contentType: 'image/jpeg', sizeBytes: JPEG.length });

  it('closed and cancelled requests refuse new upload links (GM too)', async () => {
    expect(await refusal(upload(CLOSED_ID))).toEqual({ status: 409, code: 'REQUEST_CLOSED' });
    expect(await refusal(upload(CANCELLED_ID))).toEqual({ status: 409, code: 'REQUEST_CLOSED' });
    expect(
      await refusal(createUploadUrl(harness.deps, tokens.get('gm_admin'), { requestId: CLOSED_ID, purpose: 'attachment', contentType: 'image/jpeg', sizeBytes: 10 })),
    ).toEqual({ status: 409, code: 'REQUEST_CLOSED' });
  });

  it('a completed request still awaiting confirmation accepts photos (evidence for “ยังไม่เรียบร้อย”)', async () => {
    const link = remember(await upload(AWAITING_ID));
    expect(link.method).toBe('PUT');
  });

  it('a link issued while open cannot be finalized after the request closes', async () => {
    const link = remember(await upload(CLOSING_ID));
    await harness.bucket.file(`pending/${link.upload_id}`).save(JPEG, { contentType: 'image/jpeg' });
    await harness.db.doc(`requests/${CLOSING_ID}`).update({ status: 'cancelled', cancelled_at: NOW });
    expect(await refusal(finalizeUpload(harness.deps, tokens.get('requester'), { uploadId: link.upload_id }))).toEqual({ status: 409, code: 'REQUEST_CLOSED' });
  });
});

describe('an account disabled mid-session is refused on its very next request', () => {
  it('reads detail, then enabled=false, then every endpoint refuses with ACCOUNT_DISABLED', async () => {
    const signedIn = await harness.signIn(personOf('related_person'));
    issued.push(signedIn.idToken);
    await harness.db.doc(`access/${signedIn.uid}`).set({ person_id: personOf('related_person'), role: 'requester', enabled: true });
    const detail = await getRequestDetail(harness.deps, signedIn.idToken, GENERAL_REQUEST_ID);
    expect(detail.request_id).toBe(GENERAL_REQUEST_ID);
    await harness.db.doc(`access/${signedIn.uid}`).update({ enabled: false });
    for (const endpoint of API_ENDPOINTS) {
      expect(await refusal(call(endpoint, signedIn.idToken)), endpoint.key).toEqual({ status: 403, code: 'ACCOUNT_DISABLED' });
    }
  });

  it('no token, a broken token and a non-corporate account are refused before any data is read', async () => {
    expect(await refusal(getRequestDetail(harness.deps, undefined, GENERAL_REQUEST_ID))).toEqual({ status: 401, code: 'UNAUTHENTICATED' });
    expect(await refusal(getRequestDetail(harness.deps, 'not-a-token', GENERAL_REQUEST_ID))).toEqual({ status: 401, code: 'TOKEN_INVALID' });
    expect(await refusal(getRequestDetail(harness.deps, tokens.get('outsider'), GENERAL_REQUEST_ID))).toEqual({ status: 403, code: 'NOT_CORPORATE' });
    expect(await refusal(getRequestDetail(harness.deps, tokens.get('unverified'), GENERAL_REQUEST_ID))).toEqual({ status: 403, code: 'NOT_CORPORATE' });
  });
});

describe('logs and network (runs last)', () => {
  it('nothing left the machine: every request went to the local emulators', () => {
    expect(blockedHosts).toEqual([]);
  });

  it('the captured logs hold no e-mail, name, typed detail, signed URL or token', () => {
    const text = logs.lines.join('\n');
    expect(text).toContain('"event":"');
    const secrets = new Set<string>([
      ...SUBJECT_KEYS.flatMap((key) => [SUBJECTS[key].access?.person_id, SUBJECTS[key].auth?.token.email]).filter((value): value is string => value !== undefined),
      'คุณ GM ตัวอย่าง',
      SAMPLE_REQUESTS[GENERAL_REQUEST_ID]!.description!,
      SAMPLE_REQUESTS[SECRET_REQUEST_ID]!.sensitivity_note!,
      'X-Goog-Signature',
      'X-Goog-Credential',
      'PRIVATE KEY',
      ...issued,
    ]);
    expect(issued.length).toBeGreaterThan(20);
    for (const secret of secrets) expect(text.includes(secret), `log contains ${secret.slice(0, 24)}…`).toBe(false);
    expect(text).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    expect(text).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/);
  });
});
