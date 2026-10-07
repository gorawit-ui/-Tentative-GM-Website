// S12 / D-S10-3 — attachment limits and object paths (Part 6 §6.10). Upload: signed PUT, 15 minutes;
// view: signed GET, 5 minutes (the page asks again when it expires). Images only; the size cap is
// D-S12-1: JPEG/PNG/WebP up to 2 MiB; no HEIC at the server — the web page always resizes and re-encodes
// first (U5), so an iPhone HEIC arrives as JPEG or WebP.
export const UPLOAD_URL_TTL_SECONDS = 15 * 60;
export const VIEW_URL_TTL_SECONDS = 5 * 60;
export const ATTACHMENT_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AttachmentContentType = (typeof ATTACHMENT_CONTENT_TYPES)[number];
export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
/** D-S12-3: Part 6 sets no cap, so 3 photos per submission — the reporter's form and a watcher's one contribution alike. */
export const MAX_PHOTOS_PER_SUBMISSION = 3;

/** One path segment: an opaque ID, so `/`, `.`, `%` and empty segments never appear. */
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export function attachmentObjectPath(requestId: string, attachmentId: string): string {
  if (!SEGMENT.test(requestId) || !SEGMENT.test(attachmentId)) throw new RangeError('request and attachment IDs must be opaque IDs');
  return `requests/${requestId}/attachments/${attachmentId}`;
}

/** `requests/{id}/attachments/{attachment}` exactly; anything else (../, encodings, pending, …) is undefined. */
export function parseAttachmentObjectPath(path: string): { readonly requestId: string; readonly attachmentId: string } | undefined {
  const parts = path.split('/');
  if (parts.length !== 4 || parts[0] !== 'requests' || parts[2] !== 'attachments') return undefined;
  const [, requestId = '', , attachmentId = ''] = parts;
  return SEGMENT.test(requestId) && SEGMENT.test(attachmentId) ? { requestId, attachmentId } : undefined;
}

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  bytes.length >= offset + signature.length && signature.every((byte, index) => bytes[offset + index] === byte);

/** The image type the stored bytes really start with (JPEG, PNG, WebP), or undefined. */
export function imageTypeFromBytes(bytes: Uint8Array): AttachmentContentType | undefined {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  return undefined;
}
