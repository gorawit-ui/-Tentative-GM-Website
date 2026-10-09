// S12 — API read and file endpoints (transport-agnostic; HTTP routing joins in A01).
export { ApiError } from './errors';
export { authenticate, type Caller } from './authenticate';
export { consoleLogger, type ApiLogger, type LogFields } from './log';
export type { ApiDeps, SignedUrlRequest, StorageBucket, StorageFile, TokenVerifier, UrlSigner, VerifiedToken } from './deps';
export { countAwaitingConfirmation, getRequestDetail, listComments, listGmHistory, listHistory, listMyRequests, listWaitingIntervals, markSeen, type MyRequestCard } from './requests';
export { createUploadUrl, createViewUrl, finalizeUpload, type UploadPurpose, type UploadUrl, type ViewUrl } from './files';
export { previewRelated, previewWaiting } from './previews';
export { storageUrlSigner } from './url-signer';
export { MAX_PUBLIC_CONTACTS, PUBLIC_CONTACT_TTL_MS, publicContactSource, publicContactsOf, type PublicContactSource } from './public-contact';
