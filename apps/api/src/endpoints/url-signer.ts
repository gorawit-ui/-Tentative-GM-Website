// S12 — V4 signed URLs through the Storage SDK of firebase-admin (signing happens locally when the
// credential carries a private key; on Cloud Run the service account signs through IAM).
import type { UrlSigner } from './deps';

export interface SignableBucket {
  file(path: string): {
    getSignedUrl(config: {
      readonly version: 'v4';
      readonly action: 'read' | 'write';
      readonly expires: number;
      readonly contentType?: string;
      readonly extensionHeaders?: Readonly<Record<string, string>>;
    }): Promise<[string]>;
  };
}

export function storageUrlSigner(_bucket: SignableBucket): UrlSigner {
  return {
    sign: () => Promise.reject(new Error('NOT_IMPLEMENTED')),
  };
}
