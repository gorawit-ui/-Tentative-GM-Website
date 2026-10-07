// FU-03 / FU-07 — GM adds or removes related persons on an existing request (C3, D-ACL-2).
import type { Instant } from '@gm/time';
import type { Actor } from './request-creation';

export interface RelatedPeopleState {
  readonly source: 'web' | 'trello';
  readonly isConfidential: boolean;
  readonly requesterId?: string;
  readonly relatedPersonIds: readonly string[];
  readonly confidentialGrantIds?: readonly string[];
  readonly lastUpdatedAt: Instant;
}

export interface RelatedAdditionPlan {
  readonly newRelatedPersonIds: readonly string[];
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

export function planRelatedAddition(_state: RelatedPeopleState, _personIds: readonly string[]): RelatedAdditionPlan {
  throw new Error('NOT_IMPLEMENTED');
}

export function addRelatedPersons<S extends RelatedPeopleState>(
  _state: S,
  _command: { readonly actor: Actor; readonly now: Instant; readonly personIds: readonly string[]; readonly confirmConfidentialGrant?: boolean },
): { readonly state: S; readonly event?: RelatedPersonsAddedEvent } {
  throw new Error('NOT_IMPLEMENTED');
}

export function removeRelatedPerson<S extends RelatedPeopleState>(
  _state: S,
  _command: { readonly actor: Actor; readonly now: Instant; readonly personId: string },
): { readonly state: S; readonly event: RelatedPersonRemovedEvent } {
  throw new Error('NOT_IMPLEMENTED');
}
