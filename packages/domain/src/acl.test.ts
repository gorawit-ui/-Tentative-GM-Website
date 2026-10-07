// S09 — read access (Part 6 §6.5, C4, U1): summaries for every active corporate account; request
// detail for GM, the requester and related persons only; watchers, Viewer by role, team labels,
// inactive and non-corporate accounts get nothing more. Person IDs are emails (D-S08-4).
import { describe, expect, it } from 'vitest';
import {
  canAttachToRequest,
  canContributeAsWatcher,
  canReadGmProjections,
  canReadPublicSummaries,
  canReadRequestDetail,
  isActiveViewer,
  type AccessViewer,
  type RequestAclFacts,
} from './index';

const viewer = (personId: string, role: AccessViewer['role'], overrides: Partial<AccessViewer> = {}): AccessViewer => ({
  personId,
  role,
  enabled: true,
  corporate: true,
  ...overrides,
});

const REQUESTER = viewer('requester01@tdfb.co', 'requester');
const RELATED = viewer('related01@tdfb.co', 'requester');
const WATCHER = viewer('watcher01@tdfb.co', 'requester');
const EMPLOYEE = viewer('employee01@tdfb.co', 'requester');
const VIEWER = viewer('viewer01@tdfb.co', 'viewer');
const VIEWER_RELATED = viewer('viewer02@tdfb.co', 'viewer');
const GM = viewer('gm.staff01@tdfb.co', 'gm_staff');
const GM_ADMIN = viewer('gm.admin01@tdfb.co', 'gm_admin');
const INACTIVE_REQUESTER = viewer('requester01@tdfb.co', 'requester', { enabled: false });
const INACTIVE_GM = viewer('gm.staff02@tdfb.co', 'gm_staff', { enabled: false });
const OUTSIDER = viewer('outsider@gmail.com', 'requester', { corporate: false });

const REQUEST: RequestAclFacts = {
  requesterId: REQUESTER.personId,
  relatedPersonIds: [RELATED.personId, VIEWER_RELATED.personId],
  isConfidential: false,
};
const SECRET: RequestAclFacts = { ...REQUEST, isConfidential: true };

describe('isActiveViewer', () => {
  it('needs a verified corporate login and an enabled access document', () => {
    expect(isActiveViewer(EMPLOYEE)).toBe(true);
    expect(isActiveViewer(INACTIVE_REQUESTER)).toBe(false);
    expect(isActiveViewer(OUTSIDER)).toBe(false);
    expect(isActiveViewer(undefined)).toBe(false);
  });
});

describe('summaries', () => {
  it.each([REQUESTER, RELATED, WATCHER, EMPLOYEE, VIEWER, GM, GM_ADMIN])('%o reads public summaries', (who) => {
    expect(canReadPublicSummaries(who)).toBe(true);
  });

  it.each([INACTIVE_REQUESTER, INACTIVE_GM, OUTSIDER, undefined])('%o does not', (who) => {
    expect(canReadPublicSummaries(who)).toBe(false);
  });

  it('GM projections are for active GM Staff / GM Admin only', () => {
    expect(canReadGmProjections(GM)).toBe(true);
    expect(canReadGmProjections(GM_ADMIN)).toBe(true);
    for (const who of [REQUESTER, RELATED, WATCHER, EMPLOYEE, VIEWER, INACTIVE_GM, OUTSIDER, undefined]) {
      expect(canReadGmProjections(who)).toBe(false);
    }
  });
});

describe('request detail', () => {
  it.each([
    ['requester', REQUESTER],
    ['related person', RELATED],
    ['Viewer explicitly related (Part 2 F05)', VIEWER_RELATED],
    ['GM Staff', GM],
    ['GM Admin', GM_ADMIN],
  ])('%s reads a general request', (_label, who) => {
    expect(canReadRequestDetail(who, REQUEST)).toBe(true);
  });

  it.each([
    ['watcher (summary only, U1)', WATCHER],
    ['other employee', EMPLOYEE],
    ['Viewer by role', VIEWER],
    ['inactive requester (revoked at once)', INACTIVE_REQUESTER],
    ['inactive GM', INACTIVE_GM],
    ['non-corporate account', OUTSIDER],
    ['nobody signed in', undefined],
  ])('%s does not', (_label, who) => {
    expect(canReadRequestDetail(who, REQUEST)).toBe(false);
  });

  it('confidential: GM, the requester and confirmed grants only (D-ACL-2)', () => {
    const granted: RequestAclFacts = { ...SECRET, confidentialGrantIds: [RELATED.personId] };
    for (const who of [REQUESTER, RELATED, GM, GM_ADMIN]) expect(canReadRequestDetail(who, granted)).toBe(true);
    for (const who of [WATCHER, EMPLOYEE, VIEWER, INACTIVE_REQUESTER, OUTSIDER]) {
      expect(canReadRequestDetail(who, SECRET)).toBe(false);
    }
  });

  it('a team label never grants access (C4)', () => {
    const labelled = { ...REQUEST, teamLabels: ['ทีมบัญชี'] } as RequestAclFacts;
    const accountant = viewer('accountant01@tdfb.co', 'requester');
    expect(canReadRequestDetail(accountant, labelled)).toBe(false);
  });

  it('a gm_task without requester: only GM and related persons', () => {
    const task: RequestAclFacts = { relatedPersonIds: [RELATED.personId], isConfidential: false };
    expect(canReadRequestDetail(GM, task)).toBe(true);
    expect(canReadRequestDetail(RELATED, task)).toBe(true);
    expect(canReadRequestDetail(REQUESTER, task)).toBe(false);
  });
});

describe('D-ACL-2: confidential detail needs GM, the requester or a confirmed grant — for every role', () => {
  const secretWithGrant: RequestAclFacts = { ...SECRET, confidentialGrantIds: [VIEWER_RELATED.personId] };

  it('a related person (any role) without a confirmed grant cannot read a confidential request', () => {
    expect(canReadRequestDetail(RELATED, SECRET)).toBe(false);
    expect(canReadRequestDetail(VIEWER_RELATED, SECRET)).toBe(false);
  });

  it('a confirmed grant opens it, for a Viewer as for anyone', () => {
    expect(canReadRequestDetail(VIEWER_RELATED, secretWithGrant)).toBe(true);
    expect(canReadRequestDetail(RELATED, { ...SECRET, confidentialGrantIds: [RELATED.personId] })).toBe(true);
  });

  it('the requester and GM need no grant', () => {
    for (const who of [REQUESTER, GM, GM_ADMIN]) expect(canReadRequestDetail(who, SECRET)).toBe(true);
  });

  it('the grant list decides, not the related list: a granted person reads it, the Viewer role alone does not', () => {
    expect(canReadRequestDetail(EMPLOYEE, { ...SECRET, confidentialGrantIds: [EMPLOYEE.personId] })).toBe(true);
    expect(canReadRequestDetail(VIEWER, SECRET)).toBe(false);
  });

  it('a general request still opens for related persons without any grant', () => {
    expect(canReadRequestDetail(VIEWER_RELATED, REQUEST)).toBe(true);
    expect(canReadRequestDetail(RELATED, REQUEST)).toBe(true);
  });

  it('an inactive account with a grant still cannot read it', () => {
    expect(canReadRequestDetail(INACTIVE_REQUESTER, { ...SECRET, requesterId: 'someone@tdfb.co', confidentialGrantIds: [INACTIVE_REQUESTER.personId] })).toBe(false);
  });
});

describe('S12: who may attach photos (UI-07: requester แนบรูป, GM จัดการ; related อ่าน/คอมเมนต์ — Q-S12-2)', () => {
  it('GM and the requester may attach, on general and confidential requests', () => {
    for (const request of [REQUEST, SECRET]) {
      for (const who of [GM, GM_ADMIN, REQUESTER]) expect(canAttachToRequest(who, request)).toBe(true);
    }
  });

  it('related persons (even with a grant), watchers, Viewers, inactive and outside accounts may not', () => {
    const granted: RequestAclFacts = { ...SECRET, confidentialGrantIds: [RELATED.personId] };
    for (const who of [RELATED, VIEWER_RELATED, WATCHER, EMPLOYEE, VIEWER, INACTIVE_REQUESTER, INACTIVE_GM, OUTSIDER, undefined]) {
      expect(canAttachToRequest(who, REQUEST)).toBe(false);
      expect(canAttachToRequest(who, granted)).toBe(false);
    }
  });
});

describe('S12: a watcher sends one contribution with photos at watch time (U1, Part 6 §6.4.2)', () => {
  const watched = { watcherIds: [WATCHER.personId], isConfidential: false };

  it('a watcher of a general request may contribute; everyone else may not', () => {
    expect(canContributeAsWatcher(WATCHER, watched)).toBe(true);
    for (const who of [REQUESTER, RELATED, EMPLOYEE, GM, VIEWER, INACTIVE_REQUESTER, OUTSIDER, undefined]) {
      expect(canContributeAsWatcher(who, watched)).toBe(false);
    }
  });

  it('a confidential request takes no watcher contributions', () => {
    expect(canContributeAsWatcher(WATCHER, { ...watched, isConfidential: true })).toBe(false);
  });

  it('watching never gives detail or attachment access', () => {
    expect(canReadRequestDetail(WATCHER, REQUEST)).toBe(false);
    expect(canAttachToRequest(WATCHER, REQUEST)).toBe(false);
  });
});
