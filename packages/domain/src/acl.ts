// Read access to requests and projections (S09: Part 6 §6.4/§6.5, C4, C6, A1/U1). Pure predicates
// shared by the API (Admin SDK bypasses Rules) and the Rules test fixtures; Rules mirror them in S10–S11.
import type { Role } from './request-creation';

/** Who is looking, from the verified login and `access/{uid}`. */
export interface AccessViewer {
  readonly personId: string;
  readonly role: Role;
  /** `access.enabled` (offboarding switches it off at once). */
  readonly enabled: boolean;
  /** Verified Google login with an @tdfb.co email (`hd` alone is not enough). */
  readonly corporate: boolean;
}

/** The ACL facts kept on `requests/{id}`; watchers and team labels never grant detail. */
export interface RequestAclFacts {
  readonly requesterId?: string | undefined;
  readonly relatedPersonIds: readonly string[];
  readonly isConfidential: boolean;
}

function notImplemented(name: string): never {
  throw new Error(`${name}: not implemented yet (S09)`);
}

export function isActiveViewer(_viewer: AccessViewer | undefined): boolean {
  return notImplemented('isActiveViewer');
}

export function canReadPublicSummaries(_viewer: AccessViewer | undefined): boolean {
  return notImplemented('canReadPublicSummaries');
}

export function canReadGmProjections(_viewer: AccessViewer | undefined): boolean {
  return notImplemented('canReadGmProjections');
}

export function canReadRequestDetail(_viewer: AccessViewer | undefined, _request: RequestAclFacts): boolean {
  return notImplemented('canReadRequestDetail');
}
