// S09 — ACL matrix fixture for the Firestore Rules tests of S10–S11 (Part 6 §6.4/§6.5, C4, C6, U1,
// A2, D-S06-4, D-S08-4, D-S09-5, D-ACL-1..3). Every subject × resource × operation has a decision; anything not listed
// below as `allow` is `deny` (default deny). Client writes are denied everywhere: every mutation goes
// through the API, which checks the same domain predicates (`@gm/domain` acl.ts).
//
// Usage in S10/S11: seed `seedDocuments()` with an admin context, then for each
// `matrixCells()` entry run the operation as `subject.auth` (null = signed out) and expect the
// decision. People are synthetic; person IDs are lowercase @tdfb.co emails (D-S08-4).
import { buildRequestProjections, type RequestRecord } from '@gm/contracts';
import type { AccessViewer, Role } from '@gm/domain';
import { snapshotCalendar } from '@gm/time';

export const ACL_OPERATIONS = ['get', 'list', 'create', 'update', 'delete'] as const;
export type AclOperation = (typeof ACL_OPERATIONS)[number];
export type AclDecision = 'allow' | 'deny';

export const SUBJECT_KEYS = [
  'requester',
  'related_person',
  'related_unconfirmed',
  'watcher',
  'waiting_party',
  'employee',
  'viewer',
  'viewer_related',
  'viewer_unconfirmed',
  'team_label_member',
  'gm_staff',
  'gm_admin',
  'inactive',
  'outsider',
  'unverified',
  'anonymous',
] as const;
export type SubjectKey = (typeof SUBJECT_KEYS)[number];

/** Emulator auth token as `@firebase/rules-unit-testing` `authenticatedContext(uid, token)` takes it. */
export interface SubjectAuth {
  readonly uid: string;
  readonly token: {
    readonly email: string;
    readonly email_verified: boolean;
    readonly firebase: { readonly sign_in_provider: 'google.com' };
  };
}

/** `access/{uid}` (Part 6 §6.4): role is authoritative here, not in custom claims. */
export interface AccessDocument {
  readonly person_id: string;
  readonly role: Role;
  readonly enabled: boolean;
}

export interface AclSubject {
  readonly key: SubjectKey;
  readonly description: string;
  readonly auth: SubjectAuth | null;
  readonly access?: AccessDocument;
}

function subject(key: SubjectKey, description: string, email: string, role: Role, options: { enabled?: boolean; verified?: boolean } = {}): AclSubject {
  const uid = `uid-${key.replaceAll('_', '-')}`;
  return {
    key,
    description,
    auth: { uid, token: { email, email_verified: options.verified ?? true, firebase: { sign_in_provider: 'google.com' } } },
    access: { person_id: email, role, enabled: options.enabled ?? true },
  };
}

export const SUBJECTS: Readonly<Record<SubjectKey, AclSubject>> = {
  requester: subject('requester', 'ผู้ขอของงานตัวอย่าง', 'acl.requester@tdfb.co', 'requester'),
  related_person: subject('related_person', 'related person ของงานตัวอย่าง และยืนยันสิทธิ์งานลับแล้ว (D-ACL-2)', 'acl.related@tdfb.co', 'requester'),
  related_unconfirmed: subject(
    'related_unconfirmed',
    'related person ที่ไม่ได้รับการยืนยันให้คงสิทธิ์ตอนติดธงลับ (D-ACL-2)',
    'acl.related.unconfirmed@tdfb.co',
    'requester',
  ),
  watcher: subject('watcher', 'ผู้แจ้งเพิ่ม (watcher) อ่านได้เฉพาะสรุป', 'acl.watcher@tdfb.co', 'requester'),
  waiting_party: subject('waiting_party', 'ผู้รับแจ้งของช่วงรอ (ถูกเพิ่มเป็น related ตาม C3)', 'acl.waiting@tdfb.co', 'requester'),
  employee: subject('employee', 'พนักงานทั่วไปที่ไม่เกี่ยวกับงาน', 'acl.employee@tdfb.co', 'requester'),
  viewer: subject('viewer', 'Viewer ที่ไม่เกี่ยวกับงาน', 'acl.viewer@tdfb.co', 'viewer'),
  viewer_related: subject(
    'viewer_related',
    'Viewer ที่ถูกเพิ่มเป็น related ชัดเจน และยืนยันสิทธิ์งานลับแล้ว (Part 2 F05, C3, D-ACL-2)',
    'acl.viewer.related@tdfb.co',
    'viewer',
  ),
  viewer_unconfirmed: subject(
    'viewer_unconfirmed',
    'Viewer ที่เป็น related แต่ยังไม่ได้ยืนยันสิทธิ์งานลับ (D-ACL-2)',
    'acl.viewer.unconfirmed@tdfb.co',
    'viewer',
  ),
  team_label_member: subject('team_label_member', 'คนในทีมที่ติด team_labels แต่ไม่ใช่ related (C4)', 'acl.accountant@tdfb.co', 'requester'),
  gm_staff: subject('gm_staff', 'GM Staff', 'acl.gm.staff@tdfb.co', 'gm_staff'),
  gm_admin: subject('gm_admin', 'GM Admin', 'acl.gm.admin@tdfb.co', 'gm_admin'),
  inactive: subject('inactive', 'บัญชีที่ปิดใช้งาน (เคยเป็น related และ GM)', 'acl.inactive@tdfb.co', 'gm_staff', { enabled: false }),
  outsider: subject('outsider', 'บัญชีนอก @tdfb.co (แม้มี access document)', 'acl.outsider@gmail.com', 'requester'),
  unverified: subject('unverified', 'อีเมล @tdfb.co ที่ยังไม่ verified', 'acl.unverified@tdfb.co', 'requester', { verified: false }),
  anonymous: { key: 'anonymous', description: 'ไม่ได้ login', auth: null },
};

/** Active corporate accounts (`isActive` in Part 6 §6.5). */
export const ACTIVE_SUBJECTS: readonly SubjectKey[] = [
  'requester',
  'related_person',
  'related_unconfirmed',
  'watcher',
  'waiting_party',
  'employee',
  'viewer',
  'viewer_related',
  'viewer_unconfirmed',
  'team_label_member',
  'gm_staff',
  'gm_admin',
];
export const GM_SUBJECTS: readonly SubjectKey[] = ['gm_staff', 'gm_admin'];
/** Who may read the general sample's detail: GM, requester and related persons (incl. the waiting party). */
export const DETAIL_SUBJECTS: readonly SubjectKey[] = [
  'requester',
  'related_person',
  'related_unconfirmed',
  'waiting_party',
  'viewer_related',
  'viewer_unconfirmed',
  ...GM_SUBJECTS,
];
/** D-ACL-2: on a confidential request only GM, the requester and `confidential_grant_ids` — any role. */
export const CONFIDENTIAL_DETAIL_SUBJECTS: readonly SubjectKey[] = DETAIL_SUBJECTS.filter(
  (key) => key !== 'viewer_unconfirmed' && key !== 'related_unconfirmed',
);

/** The access-document view of a subject, for the domain predicates. */
export function accessViewerOf(key: SubjectKey): AccessViewer | undefined {
  const { auth, access } = SUBJECTS[key];
  if (auth === null || access === undefined) return undefined;
  return {
    personId: access.person_id,
    role: access.role,
    enabled: access.enabled,
    corporate: auth.token.email_verified && auth.token.email.endsWith('@tdfb.co'),
  };
}

const personOf = (key: SubjectKey): string => SUBJECTS[key].access?.person_id ?? `nobody-${key}`;

/** An access document (and person) that belongs to none of the subjects. */
export const OTHER_UID = 'uid-someone-else';
export const OTHER_PERSON_ID = 'acl.someone.else@tdfb.co';

export const GENERAL_REQUEST_ID = 'req-acl-general';
export const SECRET_REQUEST_ID = 'req-acl-secret';
const T0 = Date.parse('2026-12-28T09:00:00+07:00');

const BASE_REQUEST: RequestRecord = {
  request_number: 'DEV-0901',
  type: 'maintenance',
  source: 'web',
  origin: 'requester',
  created_by_id: personOf('requester'),
  created_at: T0,
  requester_id: personOf('requester'),
  summary_title: 'แอร์ — ห้องแพ็คชั้น 1 · WH300',
  description: 'รายละเอียดที่ผู้แจ้งพิมพ์',
  category: 'assets_facilities',
  location_id: 'loc-wh300',
  area_id: 'area-wh300-pack-1',
  symptom_key: 'aircon',
  attachment_ids: ['att-acl-1'],
  assignee_id: personOf('gm_staff'),
  is_confidential: false,
  related_person_ids: [
    personOf('related_person'),
    personOf('related_unconfirmed'),
    personOf('waiting_party'),
    personOf('viewer_related'),
    personOf('viewer_unconfirmed'),
    personOf('inactive'),
  ],
  watcher_ids: [personOf('watcher')],
  team_labels: ['ทีมบัญชี'],
  status: 'waiting',
  revision: 3,
  last_updated_at: T0,
  completion_cycle_id: 0,
  waiting_on: { kind: 'person', person_id: personOf('waiting_party') },
  current_waiting_interval_id: 1,
  waiting_since: T0,
  waiting_party_responded: false,
};

export const SAMPLE_REQUESTS: Readonly<Record<string, RequestRecord>> = {
  [GENERAL_REQUEST_ID]: BASE_REQUEST,
  [SECRET_REQUEST_ID]: {
    ...BASE_REQUEST,
    request_number: 'DEV-0902',
    type: 'document_request',
    summary_title: 'ขอหนังสือรับรองเงินเดือน',
    category: 'documents_admin',
    is_confidential: true,
    sensitivity_reason: 'personnel',
    sensitivity_note: 'หมายเหตุธงลับ (GM เท่านั้น)',
    confidential_grant_ids: [personOf('related_person'), personOf('waiting_party'), personOf('viewer_related')],
    watcher_ids: [],
  },
};

const COMPANY = snapshotCalendar({ timeZone: 'Asia/Bangkok', openWeekdays: [1, 2, 3, 4, 5], holidays: ['2026-12-31', '2027-01-01'] });

/** Documents to seed (with Rules disabled) before running the matrix; projections come from S09. */
export function seedDocuments(): ReadonlyMap<string, object> {
  const docs = new Map<string, object>();
  for (const [id, request] of Object.entries(SAMPLE_REQUESTS)) {
    const projections = buildRequestProjections(id, request, {
      now: T0,
      workCalendar: COMPANY,
      personLabel: (personId) => (personId === personOf('gm_staff') ? 'คุณ GM ตัวอย่าง' : undefined),
      personTeamLabel: () => undefined,
    });
    docs.set(`requests/${id}`, projections.detail);
    if (projections.public !== null) docs.set(`request_summaries/${id}`, projections.public);
    docs.set(`gm_request_summaries/${id}`, projections.gm);
    docs.set(`gm_request_details/${id}`, projections.gmDetail);
    for (const child of ['history/evt-1', 'comments/cmt-1', 'gm_history/gmh-1', 'waiting_intervals/1']) {
      docs.set(`requests/${id}/${child}`, { request_id: id });
    }
  }
  for (const key of SUBJECT_KEYS) {
    const { auth, access } = SUBJECTS[key];
    if (auth !== null && access !== undefined) {
      docs.set(`access/${auth.uid}`, access);
      docs.set(`people/${access.person_id}`, { name: key, email: access.person_id, active: access.enabled });
      docs.set(`people_picker/${access.person_id}`, { name: key });
      docs.set(`user_state/${access.person_id}/requests/${GENERAL_REQUEST_ID}`, { type: 'requester', last_seen_activity_seq: 0 });
    }
  }
  docs.set(`access/${OTHER_UID}`, { person_id: OTHER_PERSON_ID, role: 'requester', enabled: true });
  docs.set(`user_state/${OTHER_PERSON_ID}/requests/${GENERAL_REQUEST_ID}`, { type: 'requester', last_seen_activity_seq: 0 });
  const singles: Record<string, Readonly<Record<string, unknown>>> = {
    [`gm_profiles/${personOf('gm_staff')}`]: { presence_status: { kind: 'off_site' }, focus_request_id: SECRET_REQUEST_ID },
    [`gm_profile_summaries/${personOf('gm_staff')}`]: { presence_label: 'ออกนอกสถานที่', focus_label: 'งานภายใน' },
    'board_counters/public': { internal_board_count: 1, as_of: T0 },
    'board_counters/gm_only': { as_of: T0 },
    'locations/loc-wh300': { label: 'WH300', active: true },
    'areas/area-wh300-pack-1': { location_id: 'loc-wh300', label: 'ห้องแพ็คชั้น 1' },
    'qr_codes/qr-acl-1': { location_id: 'loc-wh300', area_id: 'area-wh300-pack-1' },
    'calendars/company': { timezone: 'Asia/Bangkok' },
    'sla_policies/default': { duration: 1 },
    'settings/routing': { default_owner_by_type: {} },
    'content_pages/contact': { title: 'ติดต่อ GM' },
    'announcements/ann-1': { title: 'ประกาศ' },
    'renewal_items/ri-1': { title: 'สัญญาเช่า' },
    'renewal_items/ri-1/cycles/c-1': { cycle_number: 1 },
    'dashboard_public/current': { as_of: T0 },
    'dashboard_gm/current': { as_of: T0 },
    'scorecards/current': { as_of: T0 },
    'commands/cmd-1': { type: 'create_gm_task' },
    'outbox/out-1': { state: 'pending' },
    'outbox_heads/req-1': { request_id: 'req-1', status_revision_by_recipient: {} },
    'scheduled_work/job-1': { state: 'pending' },
    'system_counters/request_sequence': { last_issued: 902 },
    'imports/imp-1': { state: 'preview' },
    'integration_inbox/in-1': { provider: 'slack' },
    'integration_state/slack': { cursor: 'x' },
    'uploads/up-acl-1': { request_id: GENERAL_REQUEST_ID, purpose: 'attachment', state: 'pending' },
    'unknown_collection/doc-1': { anything: true },
  };
  for (const [path, data] of Object.entries(singles)) docs.set(path, data);
  return docs;
}

/** A path that may depend on who is asking (their own access/user_state document). */
type PathOf = string | ((subject: AclSubject) => string);

export interface AclResource {
  readonly key: string;
  readonly description: string;
  /** Document read by `get` / written by `create`/`update`/`delete`. */
  readonly path: PathOf;
  /** Collection queried by `list` (no filters: Rules do not filter results, Part 6 §6.5). */
  readonly collectionPath: PathOf;
  /** Operations allowed per subject; everything else is denied. */
  readonly allow: Partial<Record<SubjectKey, readonly AclOperation[]>>;
}

const READ: readonly AclOperation[] = ['get', 'list'];
const readFor = (subjects: readonly SubjectKey[], operations: readonly AclOperation[] = READ) =>
  Object.fromEntries(subjects.map((key) => [key, operations])) as Partial<Record<SubjectKey, readonly AclOperation[]>>;
const ownUid = (subject: AclSubject) => `access/${subject.auth?.uid ?? 'signed-out'}`;
const ownState = (subject: AclSubject) => `user_state/${subject.access?.person_id ?? 'signed-out'}/requests`;

const deniedEverywhere = (key: string, path: string, description: string): AclResource => ({
  key,
  description,
  path,
  collectionPath: path.slice(0, path.lastIndexOf('/')),
  allow: {},
});

export const RESOURCES: readonly AclResource[] = [
  {
    key: 'request_summaries',
    description: 'สรุปสาธารณะของงานไม่ลับ: ทุกบัญชีที่ใช้งานได้ (§6.5)',
    path: `request_summaries/${GENERAL_REQUEST_ID}`,
    collectionPath: 'request_summaries',
    allow: readFor(ACTIVE_SUBJECTS),
  },
  {
    key: 'requests.general',
    description: 'รายละเอียดงาน พร้อมคู่ person_id + display_name ของผู้สร้าง ผู้ขอ ผู้รับผิดชอบ และ related (D-S10-1, D-S11-1; ไม่มีรายชื่อ watcher/หมายเหตุธงลับ): GM, ผู้ขอ, related รวมฝ่ายที่รอ; ถอด related แล้วอ่านไม่ได้ทันที (FU-03); list ทั้ง collection ได้เฉพาะ GM',
    path: `requests/${GENERAL_REQUEST_ID}`,
    collectionPath: 'requests',
    allow: { ...readFor(DETAIL_SUBJECTS, ['get']), ...readFor(GM_SUBJECTS) },
  },
  {
    key: 'requests.confidential',
    description: 'รายละเอียดงานลับ: GM, ผู้ขอ และคนใน confidential_grant_ids เท่านั้น ทุก role (D-ACL-2)',
    path: `requests/${SECRET_REQUEST_ID}`,
    collectionPath: 'requests',
    allow: { ...readFor(CONFIDENTIAL_DETAIL_SUBJECTS, ['get']), ...readFor(GM_SUBJECTS) },
  },
  {
    key: 'request_summaries.confidential_absent',
    description: 'งานลับไม่มี document ที่นี่ เปิดแล้วไม่พบอะไร (กติกาเดียวกับ collection นี้)',
    path: `request_summaries/${SECRET_REQUEST_ID}`,
    collectionPath: 'request_summaries',
    allow: readFor(ACTIVE_SUBJECTS),
  },
  {
    key: 'gm_request_summaries',
    description: 'สรุปของ GM รวมงานลับ/stale: GM เท่านั้น',
    path: `gm_request_summaries/${SECRET_REQUEST_ID}`,
    collectionPath: 'gm_request_summaries',
    allow: readFor(GM_SUBJECTS),
  },
  {
    key: 'gm_request_details',
    description: 'รายชื่อ watcher และหมายเหตุธงลับ: GM เท่านั้น (D-S09-5)',
    path: `gm_request_details/${SECRET_REQUEST_ID}`,
    collectionPath: 'gm_request_details',
    allow: readFor(GM_SUBJECTS),
  },
  deniedEverywhere('requests.history', `requests/${GENERAL_REQUEST_ID}/history/evt-1`, 'history ผ่าน API ตรวจ parent ACL เท่านั้น'),
  deniedEverywhere('requests.comments', `requests/${GENERAL_REQUEST_ID}/comments/cmt-1`, 'คอมเมนต์ผ่าน API เท่านั้น'),
  deniedEverywhere('requests.gm_history', `requests/${GENERAL_REQUEST_ID}/gm_history/gmh-1`, 'watcher contribution/ข้อมูล GM ผ่าน API'),
  deniedEverywhere('requests.waiting_intervals', `requests/${GENERAL_REQUEST_ID}/waiting_intervals/1`, 'ช่วงรอ/recipients ผ่าน API'),
  deniedEverywhere('people', `people/${personOf('employee')}`, 'อีเมล/Slack ID: server เท่านั้น'),
  {
    key: 'people_picker',
    description: 'ชื่อ อีเมล และทีมสำหรับช่องเลือกคน: GM เท่านั้น เพราะช่องเลือกคนมีแค่ในงานของ GM (D-ACL-1)',
    path: `people_picker/${personOf('employee')}`,
    collectionPath: 'people_picker',
    allow: readFor(GM_SUBJECTS),
  },
  {
    key: 'access.self',
    description: 'access ของตัวเองเท่านั้น (บัญชีที่ปิดใช้งานก็อ่านได้ เพื่อให้หน้าเว็บบอกว่าถูกปิด, D-S09-6)',
    path: ownUid,
    collectionPath: 'access',
    allow: readFor([...ACTIVE_SUBJECTS, 'inactive'], ['get']),
  },
  deniedEverywhere('access.other', `access/${OTHER_UID}`, 'access ของคนอื่น'),
  deniedEverywhere('gm_profiles', `gm_profiles/${personOf('gm_staff')}`, 'profile GM เต็ม: ผ่าน API'),
  {
    key: 'gm_profile_summaries',
    description: 'สถานะที่อยู่/งานที่กำลังทำของ GM (งานลับแสดง “งานภายใน”): ทุกบัญชีที่ใช้งานได้',
    path: `gm_profile_summaries/${personOf('gm_staff')}`,
    collectionPath: 'gm_profile_summaries',
    allow: readFor(ACTIVE_SUBJECTS),
  },
  {
    key: 'user_state.own',
    description: 'สถานะอ่านแล้วของตัวเองเท่านั้น',
    path: (s) => `${ownState(s)}/${GENERAL_REQUEST_ID}`,
    collectionPath: ownState,
    allow: readFor(ACTIVE_SUBJECTS),
  },
  // A person who is none of the subjects, so the row is someone else's for every subject (S10 fix).
  deniedEverywhere('user_state.other', `user_state/${OTHER_PERSON_ID}/requests/${GENERAL_REQUEST_ID}`, 'ของคนอื่น'),
  {
    key: 'board_counters',
    description: 'ตัวเลข “งานภายใน X รายการ” (งานลับที่ยังเปิด, D-S09-4): get document public เท่านั้น ไม่ list (D-ACL-3)',
    path: 'board_counters/public',
    collectionPath: 'board_counters',
    allow: readFor(ACTIVE_SUBJECTS, ['get']),
  },
  deniedEverywhere('board_counters.other', 'board_counters/gm_only', 'document อื่นใน board_counters (ถ้ามีในอนาคต) ไม่เปิดให้ client (D-ACL-3)'),
  ...(['locations/loc-wh300', 'areas/area-wh300-pack-1', 'qr_codes/qr-acl-1', 'content_pages/contact', 'announcements/ann-1'] as const).map(
    (path): AclResource => ({
      key: path.slice(0, path.indexOf('/')),
      description: ['content_pages/contact', 'announcements/ann-1'].includes(path)
        ? 'ติดต่อ GM/FAQ และประกาศ: ทุกบัญชีที่ใช้งานได้ (§6.4); spec ไม่มีสถานะฉบับร่าง/ยังไม่เผยแพร่ จึงไม่มีอะไรต้องซ่อน (D-ACL-4)'
        : 'ข้อมูลอ้างอิง: ทุกบัญชีที่ใช้งานได้ (§6.4)',
      path,
      collectionPath: path.slice(0, path.indexOf('/')),
      allow: readFor(ACTIVE_SUBJECTS),
    }),
  ),
  ...(['calendars/company', 'sla_policies/default', 'settings/routing'] as const).map((path) =>
    deniedEverywhere(path.slice(0, path.indexOf('/')), path, '“อ่านค่าที่จำเป็นตามสิทธิ์” ยังไม่ชัด → ปฏิเสธไว้ก่อน (คำถาม S09)'),
  ),
  {
    key: 'renewal_items',
    description: 'ทะเบียนต่ออายุ: GM เท่านั้น',
    path: 'renewal_items/ri-1',
    collectionPath: 'renewal_items',
    allow: readFor(GM_SUBJECTS),
  },
  {
    key: 'renewal_items.cycles',
    description: 'รอบต่ออายุ: GM เท่านั้น',
    path: 'renewal_items/ri-1/cycles/c-1',
    collectionPath: 'renewal_items/ri-1/cycles',
    allow: readFor(GM_SUBJECTS),
  },
  ...(
    [
      'dashboard_public/current',
      'dashboard_gm/current',
      'scorecards/current',
      'commands/cmd-1',
      'outbox/out-1',
      'outbox_heads/req-1',
      'scheduled_work/job-1',
      'system_counters/request_sequence',
      'imports/imp-1',
      'integration_inbox/in-1',
      'integration_state/slack',
      'uploads/up-acl-1',
      'unknown_collection/doc-1',
    ] as const
  ).map((path) => deniedEverywhere(path.slice(0, path.indexOf('/')), path, 'server/API เท่านั้น หรือ path ที่ไม่มีกติกา')),
];

/** The decision for one cell; anything not explicitly allowed is denied. */
export function decide(subjectKey: SubjectKey, resourceKey: string, operation: AclOperation): AclDecision {
  const resource = RESOURCES.find((candidate) => candidate.key === resourceKey);
  if (resource === undefined) return 'deny';
  return resource.allow[subjectKey]?.includes(operation) === true ? 'allow' : 'deny';
}

export interface MatrixCell {
  readonly subject: AclSubject;
  readonly resource: AclResource;
  readonly operation: AclOperation;
  /** Document path for get/create/update/delete, collection path for list. */
  readonly path: string;
  readonly expected: AclDecision;
}

const resolve = (path: PathOf, who: AclSubject) => (typeof path === 'string' ? path : path(who));

/** Every subject × resource × operation, with the path to use and the expected decision. */
export function matrixCells(): readonly MatrixCell[] {
  return SUBJECT_KEYS.flatMap((subjectKey) =>
    RESOURCES.flatMap((resource) =>
      ACL_OPERATIONS.map((operation) => ({
        subject: SUBJECTS[subjectKey],
        resource,
        operation,
        path: resolve(operation === 'list' ? resource.collectionPath : resource.path, SUBJECTS[subjectKey]),
        expected: decide(subjectKey, resource.key, operation),
      })),
    ),
  );
}

/** How each resource reads in docs/spec/ACL-MATRIX.md (generic IDs, not the sample IDs). */
const RESOURCE_PATTERNS: Readonly<Record<string, string>> = {
  request_summaries: 'request_summaries/{id} (งานไม่ลับ)',
  'request_summaries.confidential_absent': 'request_summaries/{id} ของงานลับ (ไม่มี document)',
  'requests.general': 'requests/{id} (งานไม่ลับ)',
  'requests.confidential': 'requests/{id} (งานลับ)',
  gm_request_summaries: 'gm_request_summaries/{id}',
  gm_request_details: 'gm_request_details/{id}',
  'requests.history': 'requests/{id}/history/{event_id}',
  'requests.comments': 'requests/{id}/comments/{id}',
  'requests.gm_history': 'requests/{id}/gm_history/{event_id}',
  'requests.waiting_intervals': 'requests/{id}/waiting_intervals/{id}',
  people: 'people/{person_id}',
  people_picker: 'people_picker/{person_id}',
  'access.self': 'access/{uid ของตัวเอง}',
  'access.other': 'access/{uid ของคนอื่น}',
  gm_profiles: 'gm_profiles/{person_id}',
  gm_profile_summaries: 'gm_profile_summaries/{person_id}',
  'user_state.own': 'user_state/{person_id ของตัวเอง}/requests/{id}',
  'user_state.other': 'user_state/{person_id ของคนอื่น}/requests/{id}',
  board_counters: 'board_counters/public',
  'board_counters.other': 'board_counters/{id อื่นที่ไม่ใช่ public}',
  'renewal_items.cycles': 'renewal_items/{id}/cycles/{cycle_id}',
  system_counters: 'system_counters/{id}',
  unknown_collection: 'path อื่นที่ไม่มีกติกา',
};

/** The generic path shown to people for a resource. */
export function resourcePattern(resource: AclResource): string {
  return RESOURCE_PATTERNS[resource.key] ?? `${resource.key}/{id}`;
}
