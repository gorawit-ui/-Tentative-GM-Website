// S12 — signed URLs for attachments (Part 6 §6.10, D-S10-3). Clients never touch Storage directly
// (storage.rules deny all): the API checks access now, then signs a link for one object.
//   view:     GET, 5 minutes, only an attachment listed on a request the caller may read.
//   upload:   PUT, 15 minutes, to `pending/{upload_id}`, image types only, size within the cap,
//             bound to the caller + request + purpose in `uploads/{upload_id}` (server only).
//   finalize: only the caller who asked for the link; checks the stored size and the image bytes,
//             then moves the object out of pending. Orphans are removed after 24 h (cleanup job).
import {
  ATTACHMENT_CONTENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  MAX_PHOTOS_PER_SUBMISSION,
  UPLOAD_URL_TTL_SECONDS,
  VIEW_URL_TTL_SECONDS,
  attachmentObjectPath,
  imageTypeFromBytes,
  parseAttachmentObjectPath,
} from '@gm/contracts';
import { canAttachToRequest, canContributeAsWatcher, canReadRequestDetail, type AccessViewer } from '@gm/domain';
import { fromStored } from '../firestore/admin-store';
import { authenticate, guarded } from './authenticate';
import type { ApiDeps } from './deps';
import { ApiError, notFound } from './errors';
import { aclFacts, readableRequest, requireRequestId } from './requests';

export interface ViewUrl {
  readonly url: string;
  readonly expires_at: number;
}

export interface UploadUrl {
  readonly upload_id: string;
  readonly url: string;
  readonly method: 'PUT';
  readonly headers: Readonly<Record<string, string>>;
  readonly expires_at: number;
}

export type UploadPurpose = 'attachment' | 'watch_contribution';

/** Pending uploads not finalized within this time are orphans (Part 6 §6.10: deleted after 24 h). */
export const UPLOAD_PENDING_TTL_MS = 24 * 60 * 60 * 1000;
const UPLOADS = 'uploads';

export function createViewUrl(deps: ApiDeps, idToken: string | undefined, input: { readonly requestId: string; readonly objectPath: string }): Promise<ViewUrl> {
  return guarded(deps, 'attachment.view_url', input.requestId, async () => {
    const { viewer } = await authenticate(deps, idToken);
    requireRequestId(input.requestId);
    const target = parseAttachmentObjectPath(input.objectPath);
    if (target === undefined) throw new ApiError(400, 'PATH_INVALID');
    const request = await readableRequest(deps, viewer, input.requestId);
    const attachments = Array.isArray(request.attachment_ids) ? request.attachment_ids : [];
    if (target.requestId !== input.requestId || !attachments.includes(target.attachmentId)) throw notFound();
    const issuedAt = deps.now();
    const expiresAt = issuedAt + VIEW_URL_TTL_SECONDS * 1000;
    const url = await deps.signer.sign({ action: 'read', path: attachmentObjectPath(target.requestId, target.attachmentId), issuedAt, expiresAt });
    return { url, expires_at: expiresAt };
  });
}

function checkFile(contentType: string, sizeBytes: number): void {
  if (!(ATTACHMENT_CONTENT_TYPES as readonly string[]).includes(contentType)) throw new ApiError(400, 'CONTENT_TYPE_NOT_ALLOWED');
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1) throw new ApiError(400, 'SIZE_INVALID');
  if (sizeBytes > MAX_ATTACHMENT_BYTES) throw new ApiError(413, 'FILE_TOO_LARGE');
}

async function watcherIds(deps: ApiDeps, requestId: string): Promise<readonly string[]> {
  const watchers = (await deps.db.doc(`gm_request_details/${requestId}`).get()).data()?.watcher_ids;
  return Array.isArray(watchers) ? watchers.filter((item): item is string => typeof item === 'string') : [];
}

/** D-S12-4: closed or cancelled requests take no new photos; completed-awaiting-confirmation still does. */
function requireOpen(request: Readonly<Record<string, unknown>>): void {
  if (request.status === 'cancelled' || request.closed_at !== undefined) throw new ApiError(409, 'REQUEST_CLOSED');
}

/** Whether the caller may still use this purpose on this request (checked when issuing and when finalizing). */
async function checkPurpose(deps: ApiDeps, viewer: AccessViewer, requestId: string, purpose: UploadPurpose): Promise<void> {
  requireRequestId(requestId);
  const snapshot = await deps.db.doc(`requests/${requestId}`).get();
  if (!snapshot.exists) throw notFound();
  const request = fromStored(snapshot.data() ?? {});
  const facts = aclFacts(request);
  if (purpose === 'attachment') {
    // Someone who reads the request learns only that attaching is not theirs; others get “not found”.
    if (!canAttachToRequest(viewer, facts)) throw canReadRequestDetail(viewer, facts) ? new ApiError(403, 'ATTACH_NOT_ALLOWED') : notFound();
    requireOpen(request);
    return;
  }
  if (facts.isConfidential) throw notFound();
  if (!canContributeAsWatcher(viewer, { watcherIds: await watcherIds(deps, requestId), isConfidential: facts.isConfidential })) {
    throw new ApiError(403, 'NOT_A_WATCHER');
  }
  requireOpen(request);
}

/** D-S12-3: photos already in a watcher's one contribution — finalized, or pending and not yet expired. */
async function contributionPhotos(deps: ApiDeps, uid: string, requestId: string): Promise<number> {
  const uploads = await deps.db
    .collection(UPLOADS)
    .where('uid', '==', uid)
    .where('request_id', '==', requestId)
    .where('purpose', '==', 'watch_contribution')
    .limit(MAX_PHOTOS_PER_SUBMISSION * 20)
    .get();
  const now = deps.now();
  return uploads.docs.filter((upload) => {
    const data = upload.data();
    return data.state === 'finalized' || (data.state === 'pending' && Number(data.expire_at) > now);
  }).length;
}

export function createUploadUrl(
  deps: ApiDeps,
  idToken: string | undefined,
  input: { readonly requestId: string; readonly purpose: UploadPurpose; readonly contentType: string; readonly sizeBytes: number },
): Promise<UploadUrl> {
  return guarded(deps, 'attachment.upload_url', input.requestId, async () => {
    const { uid, viewer } = await authenticate(deps, idToken);
    if (input.purpose !== 'attachment' && input.purpose !== 'watch_contribution') throw new ApiError(400, 'PURPOSE_INVALID');
    checkFile(input.contentType, input.sizeBytes);
    await checkPurpose(deps, viewer, input.requestId, input.purpose);
    // U1 + D-S12-3: one contribution per watcher per request, with at most 3 photos in it.
    if (input.purpose === 'watch_contribution' && (await contributionPhotos(deps, uid, input.requestId)) >= MAX_PHOTOS_PER_SUBMISSION) {
      throw new ApiError(409, 'PHOTO_LIMIT_REACHED');
    }
    const uploadId = deps.newId();
    const issuedAt = deps.now();
    const expiresAt = issuedAt + UPLOAD_URL_TTL_SECONDS * 1000;
    const pendingPath = `pending/${uploadId}`;
    await deps.db.doc(`${UPLOADS}/${uploadId}`).create({
      uid,
      request_id: input.requestId,
      purpose: input.purpose,
      content_type: input.contentType,
      size_bytes: input.sizeBytes,
      object_path: pendingPath,
      state: 'pending',
      created_at: issuedAt,
      expire_at: issuedAt + UPLOAD_PENDING_TTL_MS,
    });
    const url = await deps.signer.sign({
      action: 'write',
      path: pendingPath,
      issuedAt,
      expiresAt,
      contentType: input.contentType,
      maxBytes: MAX_ATTACHMENT_BYTES,
    });
    deps.log.info('attachment.upload_issued', { upload_id: uploadId, request_id: input.requestId });
    return {
      upload_id: uploadId,
      url,
      method: 'PUT',
      headers: { 'Content-Type': input.contentType, 'x-goog-content-length-range': `1,${MAX_ATTACHMENT_BYTES}` },
      expires_at: expiresAt,
    };
  });
}

export function finalizeUpload(
  deps: ApiDeps,
  idToken: string | undefined,
  input: { readonly uploadId: string },
): Promise<{ readonly upload_id: string; readonly object_path: string }> {
  return guarded(deps, 'attachment.finalize', undefined, async () => {
    const { uid, viewer } = await authenticate(deps, idToken);
    requireRequestId(input.uploadId);
    const reference = deps.db.doc(`${UPLOADS}/${input.uploadId}`);
    const upload = (await reference.get()).data();
    // Somebody else's upload answers like a missing one.
    if (upload === undefined || upload.uid !== uid) throw notFound();
    if (upload.state !== 'pending') throw new ApiError(409, 'UPLOAD_NOT_PENDING');
    if (deps.now() > Number(upload.expire_at)) throw new ApiError(410, 'UPLOAD_EXPIRED');
    const requestId = String(upload.request_id);
    const purpose = upload.purpose as UploadPurpose;
    await checkPurpose(deps, viewer, requestId, purpose);
    const pending = deps.bucket.file(String(upload.object_path));
    const [exists] = await pending.exists();
    if (!exists) throw new ApiError(409, 'UPLOAD_MISSING');
    const [metadata] = await pending.getMetadata();
    const size = Number(metadata.size);
    if (!Number.isFinite(size) || size > Math.min(Number(upload.size_bytes), MAX_ATTACHMENT_BYTES)) {
      await pending.delete();
      throw new ApiError(413, 'FILE_TOO_LARGE');
    }
    const [head] = await pending.download({ start: 0, end: 15 });
    if (imageTypeFromBytes(head) !== upload.content_type) {
      await pending.delete();
      throw new ApiError(422, 'NOT_AN_IMAGE');
    }
    const finalPath = purpose === 'attachment' ? attachmentObjectPath(requestId, input.uploadId) : `contributions/${requestId}/${input.uploadId}`;
    await pending.copy(finalPath);
    await pending.delete();
    await reference.update({ state: 'finalized', object_path: finalPath, finalized_at: deps.now() });
    deps.log.info('attachment.finalized', { upload_id: input.uploadId, request_id: requestId });
    return { upload_id: input.uploadId, object_path: finalPath };
  });
}
