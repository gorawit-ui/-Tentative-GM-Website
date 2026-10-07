// S12 / D-S10-3 — attachment limits and object paths (Part 6 §6.10).
export const UPLOAD_URL_TTL_SECONDS = 0;
export const VIEW_URL_TTL_SECONDS = 0;
export const ATTACHMENT_CONTENT_TYPES: readonly string[] = [];
export const MAX_ATTACHMENT_BYTES = 0;

export function attachmentObjectPath(_requestId: string, _attachmentId: string): string {
  throw new Error('NOT_IMPLEMENTED');
}

export function parseAttachmentObjectPath(_path: string): { readonly requestId: string; readonly attachmentId: string } | undefined {
  throw new Error('NOT_IMPLEMENTED');
}

export function imageTypeFromBytes(_bytes: Uint8Array): string | undefined {
  throw new Error('NOT_IMPLEMENTED');
}
