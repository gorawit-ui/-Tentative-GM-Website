// A04 — previews the GM sees before confirming (F05 §9.2, C3, Part 6 §6.6 “preview recipients/ACL”):
// for a waiting party, who is told, who becomes a related person and whether a confidential request
// needs the separate grant confirmation; for related persons, who is new and who needs the grant.
// Read only (the command decides again inside its transaction); GM only; a request the caller may
// not read answers 404 like a missing one. Domain and contract refusals keep their codes.
import {
  ContractRejected,
  UNKNOWN_PERSON_DISPLAY_NAME,
  isPersonId,
  joinRequestRecord,
  parseRelatedPreview,
  parseWaitingPreview,
  type PersonDisplay,
  type RequestDocument,
} from '@gm/contracts';
import { LifecycleRejected, isGm, planRelatedAddition, planWaiting, type AccessViewer } from '@gm/domain';
import { toWaitingState, waitingOnDocument, waitingOnInput } from '../commands/waiting-state';
import { authenticate, guarded } from './authenticate';
import type { ApiDeps } from './deps';
import { ApiError } from './errors';
import { readableRequest } from './requests';

const strings = (value: unknown): readonly string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);

async function gmRequest(deps: ApiDeps, viewer: AccessViewer, requestId: string) {
  const stored = await readableRequest(deps, viewer, requestId);
  if (!isGm(viewer)) throw new ApiError(403, 'GM_ONLY');
  return toWaitingState(joinRequestRecord(stored as unknown as RequestDocument, undefined), undefined);
}

/** D-S10-1: a name, never an e-mail, for each person shown on the confirm sheet. */
async function displays(deps: ApiDeps, personIds: readonly string[]): Promise<PersonDisplay[]> {
  const shown: PersonDisplay[] = [];
  for (const personId of personIds) {
    const name = isPersonId(personId) ? (await deps.db.doc(`people/${personId}`).get()).data()?.name : undefined;
    const usable = typeof name === 'string' && name.trim() !== '' && !name.includes('@');
    shown.push({ person_id: personId, display_name: usable ? name.trim() : UNKNOWN_PERSON_DISPLAY_NAME });
  }
  return shown;
}

/** Contract and domain refusals as API errors (codes only), so they are logged as refusals. */
async function refusals<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ContractRejected) throw new ApiError(400, error.code);
    if (error instanceof LifecycleRejected) throw new ApiError(422, error.code);
    throw error;
  }
}

export function previewWaiting(deps: ApiDeps, idToken: string | undefined, requestId: string, body: unknown) {
  return guarded(deps, 'waiting_preview.read', requestId, async () => {
    const { viewer } = await authenticate(deps, idToken);
    const state = await gmRequest(deps, viewer, requestId);
    return refusals(async () => {
      const input = parseWaitingPreview(body);
      // D-S06-4: GM Staff / Admin are told but never added or granted.
      const gmPersonIds = strings((await deps.db.doc('settings/routing').get()).data()?.gm_person_ids);
      const plan = planWaiting(state, { waitingOn: waitingOnInput(input.waiting_on), notify: input.notify, gmPersonIds });
      return {
        waiting_on: waitingOnDocument(plan.waitingOn),
        recipients: await displays(deps, plan.recipientIds),
        new_related_person_ids: plan.newRelatedPersonIds,
        new_grant_person_ids: plan.newGrantPersonIds,
        needs_confidential_grant: plan.needsConfidentialGrant,
      };
    });
  });
}

export function previewRelated(deps: ApiDeps, idToken: string | undefined, requestId: string, body: unknown) {
  return guarded(deps, 'related_preview.read', requestId, async () => {
    const { viewer } = await authenticate(deps, idToken);
    const state = await gmRequest(deps, viewer, requestId);
    return refusals(async () => {
      const { person_ids: personIds } = parseRelatedPreview(body);
      const plan = planRelatedAddition(state, personIds);
      const people = [...new Set(personIds)].filter((personId) => personId !== state.requesterId);
      return {
        people: await displays(deps, people),
        new_related_person_ids: plan.newRelatedPersonIds,
        new_grant_person_ids: plan.newGrantPersonIds,
        needs_confidential_grant: plan.needsConfidentialGrant,
      };
    });
  });
}
