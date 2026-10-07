// FU-03 / FU-07 — GM adds or removes related persons on an existing request (C3, D-ACL-2). On a
// confidential request every new detail reader needs the separate grant confirmation (nothing
// pre-ticked) and is recorded in `confidential_grant_ids`; removing a person removes their grant too,
// so the next read is refused. Recipients of an open waiting interval are not touched (FU-03): the
// access check in respondWaitingParty refuses a removed person instead. Pure: the caller persists.
import type { Instant } from '@gm/time';
import { LifecycleRejected } from './command-guards';
import { isGm, type Actor } from './request-creation';

export interface RelatedPeopleState {
  readonly source: 'web' | 'trello';
  readonly isConfidential: boolean;
  readonly requesterId?: string;
  readonly relatedPersonIds: readonly string[];
  /** D-ACL-2: the only non-GM, non-requester readers of a confidential request. */
  readonly confidentialGrantIds?: readonly string[];
  readonly lastUpdatedAt: Instant;
}

/** What the GM is shown before confirming (C3, Part 6 §6.10 “preview ผู้เพิ่ม related_person_ids ก่อน commit”). */
export interface RelatedAdditionPlan {
  /** People not yet related (the requester is never added). */
  readonly newRelatedPersonIds: readonly string[];
  /** Confidential only: everyone who would read detail without a confirmed grant yet. */
  readonly newGrantPersonIds: readonly string[];
  readonly needsConfidentialGrant: boolean;
}

export interface RelatedPersonsAddedEvent {
  readonly kind: 'related_persons_added';
  readonly at: Instant;
  readonly actorId: string;
  readonly personIds: readonly string[];
  readonly grantedPersonIds: readonly string[];
}

export interface RelatedPersonRemovedEvent {
  readonly kind: 'related_person_removed';
  readonly at: Instant;
  readonly actorId: string;
  readonly personId: string;
  readonly grantWithdrawn: boolean;
}

function reject(code: string, message: string): never {
  throw new LifecycleRejected(code, message);
}

function guard(state: RelatedPeopleState, actor: Actor): void {
  if (state.source === 'trello') reject('READ_ONLY_SOURCE', 'Trello cards are read-only on the web');
  if (!isGm(actor)) reject('GM_ONLY', 'Only GM can change who is related to a request');
}

export function planRelatedAddition(state: RelatedPeopleState, personIds: readonly string[]): RelatedAdditionPlan {
  const wanted = [...new Set(personIds)].filter((personId) => personId !== state.requesterId);
  const granted = state.confidentialGrantIds ?? [];
  const newGrantPersonIds = state.isConfidential ? wanted.filter((personId) => !granted.includes(personId)) : [];
  return {
    newRelatedPersonIds: wanted.filter((personId) => !state.relatedPersonIds.includes(personId)),
    newGrantPersonIds,
    needsConfidentialGrant: newGrantPersonIds.length > 0,
  };
}

/**
 * FU-07: GM adds related persons. Confidential: `confirmConfidentialGrant` must be true whenever someone
 * would gain detail access, and they are recorded in the grant list. Nothing new = no change, no event
 * (a retried command is harmless). A GM action, so `last_updated_at` moves (same as markConfidential).
 */
export function addRelatedPersons<S extends RelatedPeopleState>(
  state: S,
  command: {
    readonly actor: Actor;
    readonly now: Instant;
    readonly personIds: readonly string[];
    readonly confirmConfidentialGrant?: boolean | undefined;
  },
): { readonly state: S; readonly event?: RelatedPersonsAddedEvent } {
  guard(state, command.actor);
  if (command.personIds.length === 0) reject('RELATED_LIST_EMPTY', 'Choose at least one person');
  const plan = planRelatedAddition(state, command.personIds);
  if (plan.needsConfidentialGrant && command.confirmConfidentialGrant !== true) {
    reject('CONFIDENTIAL_GRANT_REQUIRED', 'Adding people to a confidential request needs the separate access confirmation (C3)');
  }
  if (plan.newRelatedPersonIds.length === 0 && plan.newGrantPersonIds.length === 0) return { state };
  return {
    state: {
      ...state,
      relatedPersonIds: [...state.relatedPersonIds, ...plan.newRelatedPersonIds],
      ...(plan.newGrantPersonIds.length > 0 ? { confidentialGrantIds: [...(state.confidentialGrantIds ?? []), ...plan.newGrantPersonIds] } : {}),
      lastUpdatedAt: command.now,
    },
    event: {
      kind: 'related_persons_added',
      at: command.now,
      actorId: command.actor.personId,
      personIds: plan.newRelatedPersonIds,
      grantedPersonIds: plan.newGrantPersonIds,
    },
  };
}

/** FU-03: GM removes one related person; their confidential grant goes with them (D-ACL-2). */
export function removeRelatedPerson<S extends RelatedPeopleState>(
  state: S,
  command: { readonly actor: Actor; readonly now: Instant; readonly personId: string },
): { readonly state: S; readonly event: RelatedPersonRemovedEvent } {
  guard(state, command.actor);
  const { personId } = command;
  if (!state.relatedPersonIds.includes(personId)) reject('NOT_RELATED', 'This person is not related to the request');
  const grants = state.confidentialGrantIds;
  const grantWithdrawn = grants?.includes(personId) === true;
  return {
    state: {
      ...state,
      relatedPersonIds: state.relatedPersonIds.filter((id) => id !== personId),
      ...(grants === undefined ? {} : { confidentialGrantIds: grants.filter((id) => id !== personId) }),
      lastUpdatedAt: command.now,
    },
    event: { kind: 'related_person_removed', at: command.now, actorId: command.actor.personId, personId, grantWithdrawn },
  };
}
