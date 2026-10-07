// FU-03 / FU-07 — GM adds or removes related persons on an existing request. On a confidential
// request every new detail reader needs the separate grant confirmation (C3, D-ACL-2) and is
// recorded in confidential_grant_ids; removing a person also removes their grant, so they lose
// detail at once (S11 “revoke fail next read”). Pure: the caller persists state and event.
import { describe, expect, it } from 'vitest';
import {
  LifecycleRejected,
  addRelatedPersons,
  canReadRequestDetail,
  planRelatedAddition,
  removeRelatedPerson,
  type AccessViewer,
  type Actor,
  type RelatedPeopleState,
} from './index';

const GM: Actor = { personId: 'gm.staff01@tdfb.co', role: 'gm_staff' };
const GM_ADMIN: Actor = { personId: 'gm.admin01@tdfb.co', role: 'gm_admin' };
const REQUESTER: Actor = { personId: 'requester01@tdfb.co', role: 'requester' };
const VIEWER: Actor = { personId: 'viewer01@tdfb.co', role: 'viewer' };
const RELATED = 'related01@tdfb.co';
const OTHER = 'related02@tdfb.co';
const NEWCOMER = 'newcomer01@tdfb.co';

const CREATED = Date.parse('2026-12-28T09:00:00+07:00');
const NOW = Date.parse('2026-12-29T10:00:00+07:00');

const general = (overrides: Partial<RelatedPeopleState> = {}): RelatedPeopleState => ({
  source: 'web',
  isConfidential: false,
  requesterId: REQUESTER.personId,
  relatedPersonIds: [RELATED, OTHER],
  lastUpdatedAt: CREATED,
  ...overrides,
});
const secret = (overrides: Partial<RelatedPeopleState> = {}) =>
  general({ isConfidential: true, confidentialGrantIds: [RELATED], ...overrides });

function code(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    if (error instanceof LifecycleRejected) return error.code;
    throw error;
  }
  throw new Error('expected LifecycleRejected');
}

const reader = (personId: string): AccessViewer => ({ personId, role: 'requester', enabled: true, corporate: true });
const facts = (state: RelatedPeopleState) => ({
  requesterId: state.requesterId,
  relatedPersonIds: state.relatedPersonIds,
  isConfidential: state.isConfidential,
  confidentialGrantIds: state.confidentialGrantIds,
});

describe('planRelatedAddition — what the GM is shown before confirming (C3)', () => {
  it('general request: new people become related, no grant needed', () => {
    expect(planRelatedAddition(general(), [NEWCOMER, RELATED, REQUESTER.personId])).toEqual({
      newRelatedPersonIds: [NEWCOMER],
      newGrantPersonIds: [],
      needsConfidentialGrant: false,
    });
  });

  it('confidential request: new people and related people without a grant need the confirmation', () => {
    expect(planRelatedAddition(secret(), [NEWCOMER, OTHER, RELATED, REQUESTER.personId, NEWCOMER])).toEqual({
      newRelatedPersonIds: [NEWCOMER],
      newGrantPersonIds: [NEWCOMER, OTHER],
      needsConfidentialGrant: true,
    });
  });
});

describe('addRelatedPersons (FU-07)', () => {
  it('general request: adds without any grant; GM action moves last_updated_at', () => {
    const { state, event } = addRelatedPersons(general(), { actor: GM, now: NOW, personIds: [NEWCOMER] });
    expect(state.relatedPersonIds).toEqual([RELATED, OTHER, NEWCOMER]);
    expect(state).not.toHaveProperty('confidentialGrantIds');
    expect(state.lastUpdatedAt).toBe(NOW);
    expect(event).toEqual({ kind: 'related_persons_added', at: NOW, actorId: GM.personId, personIds: [NEWCOMER], grantedPersonIds: [] });
  });

  it('confidential request without the separate confirmation is refused (nothing pre-ticked)', () => {
    expect(code(() => addRelatedPersons(secret(), { actor: GM, now: NOW, personIds: [NEWCOMER] }))).toBe('CONFIDENTIAL_GRANT_REQUIRED');
    expect(code(() => addRelatedPersons(secret(), { actor: GM, now: NOW, personIds: [NEWCOMER], confirmConfidentialGrant: false }))).toBe(
      'CONFIDENTIAL_GRANT_REQUIRED',
    );
  });

  it('confidential request with the confirmation: related + grant recorded, and they can read', () => {
    const { state, event } = addRelatedPersons(secret(), { actor: GM_ADMIN, now: NOW, personIds: [NEWCOMER, OTHER], confirmConfidentialGrant: true });
    expect(state.relatedPersonIds).toEqual([RELATED, OTHER, NEWCOMER]);
    expect(state.confidentialGrantIds).toEqual([RELATED, NEWCOMER, OTHER]);
    expect(event).toMatchObject({ personIds: [NEWCOMER], grantedPersonIds: [NEWCOMER, OTHER] });
    expect(canReadRequestDetail(reader(NEWCOMER), facts(state))).toBe(true);
    expect(canReadRequestDetail(reader(OTHER), facts(state))).toBe(true);
  });

  it('nothing new (already related and granted, or the requester) changes nothing and records no event', () => {
    const before = secret();
    const result = addRelatedPersons(before, { actor: GM, now: NOW, personIds: [RELATED, REQUESTER.personId] });
    expect(result.state).toBe(before);
    expect(result.event).toBeUndefined();
  });

  it.each([
    ['requester', REQUESTER, 'GM_ONLY'],
    ['Viewer', VIEWER, 'GM_ONLY'],
  ] as const)('%s cannot add related persons', (_label, actor, expected) => {
    expect(code(() => addRelatedPersons(general(), { actor, now: NOW, personIds: [NEWCOMER] }))).toBe(expected);
  });

  it('refuses an empty list and Trello cards', () => {
    expect(code(() => addRelatedPersons(general(), { actor: GM, now: NOW, personIds: [] }))).toBe('RELATED_LIST_EMPTY');
    expect(code(() => addRelatedPersons(general({ source: 'trello' }), { actor: GM, now: NOW, personIds: [NEWCOMER] }))).toBe('READ_ONLY_SOURCE');
  });
});

describe('removeRelatedPerson (FU-03)', () => {
  it('GM removes a related person from a general request: they lose detail at once', () => {
    const before = general();
    expect(canReadRequestDetail(reader(OTHER), facts(before))).toBe(true);
    const { state, event } = removeRelatedPerson(before, { actor: GM, now: NOW, personId: OTHER });
    expect(state.relatedPersonIds).toEqual([RELATED]);
    expect(state.lastUpdatedAt).toBe(NOW);
    expect(event).toEqual({ kind: 'related_person_removed', at: NOW, actorId: GM.personId, personId: OTHER, grantWithdrawn: false });
    expect(canReadRequestDetail(reader(OTHER), facts(state))).toBe(false);
  });

  it('on a confidential request the grant goes too, so a later re-add needs a new confirmation', () => {
    const { state, event } = removeRelatedPerson(secret(), { actor: GM_ADMIN, now: NOW, personId: RELATED });
    expect(state.relatedPersonIds).toEqual([OTHER]);
    expect(state.confidentialGrantIds).toEqual([]);
    expect(event.grantWithdrawn).toBe(true);
    expect(canReadRequestDetail(reader(RELATED), facts(state))).toBe(false);
    expect(code(() => addRelatedPersons(state, { actor: GM, now: NOW, personIds: [RELATED] }))).toBe('CONFIDENTIAL_GRANT_REQUIRED');
  });

  it('the system does not remove them from an open waiting interval; the access check refuses them instead', () => {
    // Recipients live on the interval (A2); FU-03: no automatic recipient removal.
    const { state } = removeRelatedPerson(general(), { actor: GM, now: NOW, personId: OTHER });
    expect(state).not.toHaveProperty('waitingRecipients');
  });

  it.each([
    ['someone who is not related', NEWCOMER, 'NOT_RELATED'],
    ['the requester (not a related person)', REQUESTER.personId, 'NOT_RELATED'],
  ])('refuses %s', (_label, personId, expected) => {
    expect(code(() => removeRelatedPerson(general(), { actor: GM, now: NOW, personId }))).toBe(expected);
  });

  it('only GM, and never on a Trello card', () => {
    expect(code(() => removeRelatedPerson(general(), { actor: REQUESTER, now: NOW, personId: OTHER }))).toBe('GM_ONLY');
    expect(code(() => removeRelatedPerson(general(), { actor: VIEWER, now: NOW, personId: OTHER }))).toBe('GM_ONLY');
    expect(code(() => removeRelatedPerson(general({ source: 'trello' }), { actor: GM, now: NOW, personId: OTHER }))).toBe('READ_ONLY_SOURCE');
  });
});
