// S12 — what the read/file endpoints need. Production wires firebase-admin (Firestore, Auth,
// Storage) and the Storage URL signer; tests wire the same SDK against the local emulators.
import type { Firestore } from 'firebase-admin/firestore';
import type { Instant } from '@gm/time';
import type { ApiLogger } from './log';

/** The verified ID token fields the API uses (firebase-admin DecodedIdToken). */
export interface VerifiedToken {
  readonly uid: string;
  readonly email?: string;
  readonly email_verified?: boolean;
  readonly firebase: { readonly sign_in_provider: string };
}

export interface TokenVerifier {
  verifyIdToken(idToken: string): Promise<VerifiedToken>;
}

/** The part of a Storage file the endpoints use (firebase-admin / @google-cloud/storage File). */
export interface StorageFile {
  exists(): Promise<[boolean]>;
  getMetadata(): Promise<[{ readonly size?: string | number; readonly contentType?: string }, ...unknown[]]>;
  download(options?: { readonly start?: number; readonly end?: number }): Promise<[Uint8Array]>;
  copy(destination: string): Promise<unknown>;
  delete(): Promise<unknown>;
}

export interface StorageBucket {
  file(path: string): StorageFile;
}

export interface SignedUrlRequest {
  readonly action: 'read' | 'write';
  readonly path: string;
  /** API clock at signing (the link is valid from here to `expiresAt`). */
  readonly issuedAt: Instant;
  readonly expiresAt: Instant;
  readonly contentType?: string;
  /** `x-goog-content-length-range` for uploads. */
  readonly maxBytes?: number;
}

export interface UrlSigner {
  sign(request: SignedUrlRequest): Promise<string>;
}

export interface ApiDeps {
  readonly db: Firestore;
  readonly auth: TokenVerifier;
  readonly bucket: StorageBucket;
  readonly signer: UrlSigner;
  readonly now: () => Instant;
  readonly newId: () => string;
  readonly log: ApiLogger;
}
