// S09 — the ACL matrix fixture itself: complete, default deny, no client writes, and consistent with
// the domain read predicates the API uses (so S10/S11 Rules and the API enforce one policy).
import { describe, expect, it } from 'vitest';
import { toRequestSummaryDocument } from '@gm/contracts';
import { canReadGmProjections, canReadPublicSummaries, canReadRequestDetail } from '@gm/domain';
import {
  ACL_OPERATIONS,
  ACTIVE_SUBJECTS,
  GENERAL_REQUEST_ID,
  RESOURCES,
  SAMPLE_REQUESTS,
  SECRET_REQUEST_ID,
  SUBJECTS,
  SUBJECT_KEYS,
  accessViewerOf,
  decide,
  matrixCells,
  seedDocuments,
  type SubjectKey,
} from './acl-matrix';

const facts = (id: string) => {
  const request = SAMPLE_REQUESTS[id];
  if (request === undefined) throw new Error(`no sample ${id}`);
  return {
    requesterId: request.requester_id,
    relatedPersonIds: request.related_person_ids,
    isConfidential: request.is_confidential,
    confidentialGrantIds: request.confidential_grant_ids,
  };
};

describe('ACL matrix — shape', () => {
  it('covers every subject the task lists (and signed-out / unverified as extra deny rows)', () => {
    expect(SUBJECT_KEYS).toEqual(
      expect.arrayContaining([
        'requester',
        'related_person',
        'watcher',
        'waiting_party',
        'viewer',
        'gm_staff',
        'gm_admin',
        'inactive',
        'outsider',
      ]),
    );
  });

  it('has one cell per subject × resource × operation, each allow or deny', () => {
    const cells = matrixCells();
    expect(cells).toHaveLength(SUBJECT_KEYS.length * RESOURCES.length * ACL_OPERATIONS.length);
    expect(new Set(cells.map((cell) => cell.expected))).toEqual(new Set(['allow', 'deny']));
  });

  it('resource keys are unique and every path exists in the seed (or is deliberately absent)', () => {
    expect(new Set(RESOURCES.map((resource) => resource.key)).size).toBe(RESOURCES.length);
    const seeded = seedDocuments();
    for (const cell of matrixCells().filter((c) => c.operation === 'get' && c.subject.auth !== null)) {
      if (cell.resource.key === 'request_summaries.confidential_absent') expect(seeded.has(cell.path)).toBe(false);
      else expect(seeded.has(cell.path), cell.path).toBe(true);
    }
  });

  it('covers every collection of Part 6 §6.4 plus an unmatched path', () => {
    const collections = new Set(
      RESOURCES.map((resource) => (typeof resource.path === 'string' ? resource.path : resource.path(SUBJECTS.employee)).split('/')[0]),
    );
    for (const name of [
      'request_summaries',
      'requests',
      'gm_request_summaries',
      'gm_request_details',
      'people',
      'people_picker',
      'access',
      'gm_profiles',
      'gm_profile_summaries',
      'user_state',
      'locations',
      'areas',
      'qr_codes',
      'calendars',
      'sla_policies',
      'settings',
      'content_pages',
      'announcements',
      'renewal_items',
      'dashboard_public',
      'dashboard_gm',
      'scorecards',
      'commands',
      'outbox',
      'scheduled_work',
      'system_counters',
      'imports',
      'integration_inbox',
      'integration_state',
      'board_counters',
      'unknown_collection',
    ]) {
      expect(collections, name).toContain(name);
    }
  });
});

describe('ACL matrix — default deny', () => {
  it('an unknown resource or anything not listed is denied', () => {
    expect(decide('gm_admin', 'no_such_resource', 'get')).toBe('deny');
    expect(decide('gm_admin', 'commands', 'get')).toBe('deny');
  });

  it('no client create, update or delete anywhere (every mutation goes through the API)', () => {
    expect(matrixCells().filter((cell) => cell.operation !== 'get' && cell.operation !== 'list' && cell.expected === 'allow')).toEqual([]);
  });

  it.each(['outsider', 'unverified', 'anonymous'] as const)('%s is denied everything', (key) => {
    expect(matrixCells().filter((cell) => cell.subject.key === key && cell.expected === 'allow')).toEqual([]);
  });

  it('an inactive account can only read its own access document', () => {
    expect(
      matrixCells()
        .filter((cell) => cell.subject.key === 'inactive' && cell.expected === 'allow')
        .map((cell) => `${cell.resource.key}:${cell.operation}`),
    ).toEqual(['access.self:get']);
  });

  it('subcollections, people, full GM profiles, aggregates and server collections: nobody, not even GM Admin', () => {
    for (const key of [
      'requests.history',
      'requests.comments',
      'requests.gm_history',
      'requests.waiting_intervals',
      'people',
      'gm_profiles',
      'dashboard_public',
      'dashboard_gm',
      'scorecards',
      'commands',
      'outbox',
      'system_counters',
    ]) {
      for (const subject of SUBJECT_KEYS) {
        for (const operation of ACL_OPERATIONS) expect(decide(subject, key, operation), `${subject} ${key} ${operation}`).toBe('deny');
      }
    }
  });
});

describe('ACL matrix — the same policy as the domain predicates', () => {
  it.each(SUBJECT_KEYS)('%s: public summaries follow canReadPublicSummaries', (key) => {
    const expected = canReadPublicSummaries(accessViewerOf(key)) ? 'allow' : 'deny';
    expect(decide(key, 'request_summaries', 'get')).toBe(expected);
    expect(decide(key, 'request_summaries', 'list')).toBe(expected);
  });

  it.each(SUBJECT_KEYS)('%s: GM summaries follow canReadGmProjections', (key) => {
    expect(decide(key, 'gm_request_summaries', 'get')).toBe(canReadGmProjections(accessViewerOf(key)) ? 'allow' : 'deny');
  });

  it.each(SUBJECT_KEYS)('%s: request detail (general and confidential) follows canReadRequestDetail', (key) => {
    const viewer = accessViewerOf(key);
    expect(decide(key, 'requests.general', 'get')).toBe(canReadRequestDetail(viewer, facts(GENERAL_REQUEST_ID)) ? 'allow' : 'deny');
    expect(decide(key, 'requests.confidential', 'get')).toBe(canReadRequestDetail(viewer, facts(SECRET_REQUEST_ID)) ? 'allow' : 'deny');
  });

  it('watcher and team-label member alone get no detail (U1, C4); listing all requests is GM only', () => {
    for (const key of ['watcher', 'team_label_member', 'employee', 'viewer'] as const satisfies readonly SubjectKey[]) {
      expect(decide(key, 'requests.general', 'get')).toBe('deny');
    }
    for (const key of ACTIVE_SUBJECTS) {
      expect(decide(key, 'requests.general', 'list')).toBe(key === 'gm_staff' || key === 'gm_admin' ? 'allow' : 'deny');
    }
  });

  it('the seed has no public summary for the confidential sample and no private field in the public one', () => {
    const seeded = seedDocuments();
    expect(seeded.has(`request_summaries/${SECRET_REQUEST_ID}`)).toBe(false);
    expect(toRequestSummaryDocument(SECRET_REQUEST_ID, SAMPLE_REQUESTS[SECRET_REQUEST_ID]!, {
      personLabel: () => undefined,
      personTeamLabel: () => undefined,
    })).toBeNull();
    const text = JSON.stringify(seeded.get(`request_summaries/${GENERAL_REQUEST_ID}`));
    for (const secret of ['@', 'รายละเอียดที่ผู้แจ้งพิมพ์', 'att-acl', 'ทีมบัญชี']) expect(text).not.toContain(secret);
  });
});

describe('D-S09 in the matrix', () => {
  it('D-S09-2: a related Viewer opens the confidential request only with the confirmed grant', () => {
    expect(decide('viewer_related', 'requests.confidential', 'get')).toBe('allow');
    expect(decide('viewer_unconfirmed', 'requests.confidential', 'get')).toBe('deny');
    expect(decide('viewer_unconfirmed', 'requests.general', 'get')).toBe('allow');
    expect(decide('viewer', 'requests.confidential', 'get')).toBe('deny');
  });

  it('D-S09-5: the watcher list and the confidential note are only in gm_request_details (GM read)', () => {
    const seeded = seedDocuments();
    for (const id of [GENERAL_REQUEST_ID, SECRET_REQUEST_ID]) {
      expect(seeded.get(`requests/${id}`)).not.toHaveProperty('watcher_ids');
      expect(seeded.get(`requests/${id}`)).not.toHaveProperty('sensitivity_note');
    }
    expect(seeded.get(`gm_request_details/${GENERAL_REQUEST_ID}`)).toEqual({ watcher_ids: ['acl.watcher@tdfb.co'] });
    expect(seeded.get(`gm_request_details/${SECRET_REQUEST_ID}`)).toMatchObject({ sensitivity_note: expect.any(String) });
    for (const key of SUBJECT_KEYS) {
      expect(decide(key, 'gm_request_details', 'get')).toBe(key === 'gm_staff' || key === 'gm_admin' ? 'allow' : 'deny');
    }
  });

  it('D-S09-6: an inactive account reads only its own access document', () => {
    expect(
      matrixCells()
        .filter((cell) => cell.subject.key === 'inactive' && cell.expected === 'allow')
        .map((cell) => `${cell.resource.key}:${cell.operation}`),
    ).toEqual(['access.self:get']);
  });
});

describe('D-ACL review changes in the matrix', () => {
  it('D-ACL-1: people_picker is read by GM Staff and GM Admin only', () => {
    for (const key of SUBJECT_KEYS) {
      const expected = key === 'gm_staff' || key === 'gm_admin' ? 'allow' : 'deny';
      expect(decide(key, 'people_picker', 'get'), key).toBe(expected);
      expect(decide(key, 'people_picker', 'list'), key).toBe(expected);
    }
  });

  it('D-ACL-2: a related person without a confirmed grant (any role) cannot open the confidential request', () => {
    expect(SUBJECT_KEYS).toContain('related_unconfirmed');
    expect(decide('related_unconfirmed' as SubjectKey, 'requests.general', 'get')).toBe('allow');
    expect(decide('related_unconfirmed' as SubjectKey, 'requests.confidential', 'get')).toBe('deny');
    expect(decide('related_person', 'requests.confidential', 'get')).toBe('allow');
    expect(decide('requester', 'requests.confidential', 'get')).toBe('allow');
  });

  it('D-ACL-3: board_counters/public can be opened (get) but the collection cannot be listed', () => {
    for (const key of SUBJECT_KEYS) {
      expect(decide(key, 'board_counters', 'list'), key).toBe('deny');
    }
    expect(decide('employee', 'board_counters', 'get')).toBe('allow');
    expect(decide('outsider', 'board_counters', 'get')).toBe('deny');
  });
});
