// S12 — signed URLs for attachments (Part 6 §6.10, D-S10-3).
import type { ApiDeps } from './deps';

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

export async function createViewUrl(_deps: ApiDeps, _idToken: string | undefined, _input: { readonly requestId: string; readonly objectPath: string }): Promise<ViewUrl> {
  throw new Error('NOT_IMPLEMENTED');
}

export async function createUploadUrl(
  _deps: ApiDeps,
  _idToken: string | undefined,
  _input: { readonly requestId: string; readonly purpose: UploadPurpose; readonly contentType: string; readonly sizeBytes: number },
): Promise<UploadUrl> {
  throw new Error('NOT_IMPLEMENTED');
}

export async function finalizeUpload(
  _deps: ApiDeps,
  _idToken: string | undefined,
  _input: { readonly uploadId: string },
): Promise<{ readonly upload_id: string; readonly object_path: string }> {
  throw new Error('NOT_IMPLEMENTED');
}
