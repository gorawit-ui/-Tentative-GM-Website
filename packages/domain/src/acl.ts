// Read access to requests and projections (S09: Part 6 §6.4/§6.5, C4, C6, A1/U1). Pure predicates
// shared by the API (Admin SDK bypasses Rules) and the Rules test fixtures; Rules mirror them in S10–S11.
import { isGm, type Role } from './request-creation';

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
  /** D-ACL-2: the only non-GM, non-requester people who may read a confidential request (C3). */
  readonly confidentialGrantIds?: readonly string[] | undefined;
}

/** Part 6 §6.5 `isActive`: verified corporate Google login AND an enabled access document. */
export function isActiveViewer(viewer: AccessViewer | undefined): viewer is AccessViewer {
  return viewer !== undefined && viewer.corporate && viewer.enabled;
}

/** `request_summaries`, people picker, safe counters/profiles: every active employee (incl. Viewer). */
export function canReadPublicSummaries(viewer: AccessViewer | undefined): boolean {
  return isActiveViewer(viewer);
}

/** `gm_request_summaries` and other GM projections: active GM Staff / GM Admin. */
export function canReadGmProjections(viewer: AccessViewer | undefined): boolean {
  return isActiveViewer(viewer) && isGm(viewer);
}

/**
 * Part 6 §6.5 `canReadRequest`: active GM or the requester; on a general request also an explicitly
 * related person (a Viewer included, Part 2 F05); on a confidential request only people in the
 * confirmed grant list (D-ACL-2, any role). Watching, team labels and a role alone never grant detail.
 */
export function canReadRequestDetail(viewer: AccessViewer | undefined, request: RequestAclFacts): boolean {
  if (!isActiveViewer(viewer)) return false;
  if (isGm(viewer) || request.requesterId === viewer.personId) return true;
  // D-ACL-2: a confidential request opens only for confirmed grants, whatever the role.
  if (request.isConfidential) return (request.confidentialGrantIds ?? []).includes(viewer.personId);
  return request.relatedPersonIds.includes(viewer.personId);
}

/** S12: GM and the requester attach photos to a request (UI-07); related persons only read/comment (Q-S12-2). */
export function canAttachToRequest(viewer: AccessViewer | undefined, request: RequestAclFacts): boolean {
  if (!isActiveViewer(viewer)) return false;
  return isGm(viewer) || request.requesterId === viewer.personId;
}

/** S12 / U1: a watcher of a general request sends one contribution (note/photos) when watching. */
export function canContributeAsWatcher(
  viewer: AccessViewer | undefined,
  request: { readonly watcherIds: readonly string[]; readonly isConfidential: boolean },
): boolean {
  return isActiveViewer(viewer) && !request.isConfidential && request.watcherIds.includes(viewer.personId);
}

