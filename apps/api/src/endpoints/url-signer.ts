// S12 — V4 signed URLs through the Storage SDK of firebase-admin. The signing time is the API clock
// (`accessibleAt`), so `X-Goog-Expires` is exactly the TTL. Signing is local when the credential
// carries a private key; on Cloud Run the service account signs through IAM. URLs are returned to the
// caller only — never logged (Part 6 §6.10).
import type { UrlSigner } from './deps';

export interface SignableBucket {
  file(path: string): {
    getSignedUrl(config: {
      readonly version: 'v4';
      readonly action: 'read' | 'write';
      readonly accessibleAt: Date;
      readonly expires: number;
      readonly contentType?: string;
      readonly extensionHeaders?: Readonly<Record<string, string>>;
    }): Promise<[string]>;
  };
}

export function storageUrlSigner(bucket: SignableBucket): UrlSigner {
  return {
    async sign(request) {
      const [url] = await bucket.file(request.path).getSignedUrl({
        version: 'v4',
        action: request.action,
        accessibleAt: new Date(request.issuedAt),
        expires: request.expiresAt,
        ...(request.contentType === undefined ? {} : { contentType: request.contentType }),
        ...(request.maxBytes === undefined ? {} : { extensionHeaders: { 'x-goog-content-length-range': `1,${request.maxBytes}` } }),
      });
      return url;
    },
  };
}
