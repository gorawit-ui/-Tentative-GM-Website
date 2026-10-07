// S09 — ACL matrix fixture for the Firestore Rules tests of S10–S11 (Part 6 §6.4/§6.5, C4, C6, U1,
// A2, D-S06-4, D-S08-4). Every subject × resource × operation has a decision; anything not listed
// below as `allow` is `deny` (default deny). Client writes are denied everywhere: every mutation goes
// through the API, which checks the same domain predicates (`@gm/domain` acl.ts).
//
// Usage in S10/S11: seed `seedDocuments()` with an admin context, then for each
// `matrixCells()` entry run the operation as `subject.auth` (null = signed out) and expect the
// decision. People are synthetic; person IDs are lowercase @tdfb.co emails (D-S08-4).
import { buildRequestProjections, type RequestDocument } from '@gm/contracts';
import type { AccessViewer, Role } from '@gm/domain';
import { snapshotCalendar } from '@gm/time';

export const ACL_OPERATIONS = ['get', 'list', 'create', 'update', 'delete'] as const;
export type AclOperation = (typeof ACL_OPERATIONS)[number];
export type AclDecision = 'allow' | 'deny';

export const SUBJECT_KEYS = [
  'requester',
  'related_person',
  'watcher',
  'waiting_party',
  'employee',
  'viewer',
  'viewer_related',
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
  related_person: subject('related_person', 'related person ของงานตัวอย่าง', 'acl.related@tdfb.co', 'requester'),
  watcher: subject('watcher', 'ผู้แจ้งเพิ่ม (watcher) อ่านได้เฉพาะสรุป', 'acl.watcher@tdfb.co', 'requester'),
  waiting_party: subject('waiting_party', 'ผู้รับแจ้งของช่วงรอ (ถูกเพิ่มเป็น related ตาม C3)', 'acl.waiting@tdfb.co', 'requester'),
  employee: subject('employee', 'พนักงานทั่วไปที่ไม่เกี่ยวกับงาน', 'acl.employee@tdfb.co', 'requester'),
  viewer: subject('viewer', 'Viewer ที่ไม่เกี่ยวกับงาน', 'acl.viewer@tdfb.co', 'viewer'),
  viewer_related: subject('viewer_related', 'Viewer ที่ถูกเพิ่มเป็น related ชัดเจน (Part 2 F05)', 'acl.viewer.related@tdfb.co', 'viewer'),
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
  'watcher',
  'waiting_party',
  'employee',
  'viewer',
  'viewer_related',
  'team_label_member',
  'gm_staff',
  'gm_admin',
];
export const GM_SUBJECTS: readonly SubjectKey[] = ['gm_staff', 'gm_admin'];
/** Who may read the sample requests' detail: GM, requester and related persons (incl. the waiting party). */
export const DETAIL_SUBJECTS: readonly SubjectKey[] = ['requester', 'related_person', 'waiting_party', 'viewer_related', ...GM_SUBJECTS];

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

/** An access document that belongs to none of the subjects. */
export const OTHER_UID = 'uid-someone-else';

export const GENERAL_REQUEST_ID = 'req-acl-general';
export const SECRET_REQUEST_ID = 'req-acl-secret';
const T0 = Date.parse('2026-12-28T09:00:00+07:00');

const BASE_REQUEST: RequestDocument = {
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
  related_person_ids: [personOf('related_person'), personOf('waiting_party'), personOf('viewer_related'), personOf('inactive')],
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

export const SAMPLE_REQUESTS: Readonly<Record<string, RequestDocument>> = {
  [GENERAL_REQUEST_ID]: BASE_REQUEST,
  [SECRET_REQUEST_ID]: {
    ...BASE_REQUEST,
    request_number: 'DEV-0902',
    type: 'document_request',
    summary_title: 'ขอหนังสือรับรองเงินเดือน',
    category: 'documents_admin',
    is_confidential: true,
    sensitivity_reason: 'personnel',
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
    });
    docs.set(`requests/${id}`, projections.detail);
    if (projections.public !== null) docs.set(`request_summaries/${id}`, projections.public);
    docs.set(`gm_request_summaries/${id}`, projections.gm);
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
  docs.set(`access/${OTHER_UID}`, { person_id: 'acl.someone.else@tdfb.co', role: 'requester', enabled: true });
  const singles: Record<string, Readonly<Record<string, unknown>>> = {
    [`gm_profiles/${personOf('gm_staff')}`]: { presence_status: { kind: 'off_site' }, focus_request_id: SECRET_REQUEST_ID },
    [`gm_profile_summaries/${personOf('gm_staff')}`]: { presence_label: 'ออกนอกสถานที่', focus_label: 'งานภายใน' },
    'board_counters/public': { internal_board_count: 1, as_of: T0 },
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
    'scheduled_work/job-1': { state: 'pending' },
    'system_counters/request_sequence': { last_issued: 902 },
    'imports/imp-1': { state: 'preview' },
    'integration_inbox/in-1': { provider: 'slack' },
    'integration_state/slack': { cursor: 'x' },
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
    description: 'สรุปสาธารณะของงานไม่ลับ: active corporate อ่านได้ทุกคน (§6.5)',
    path: `request_summaries/${GENERAL_REQUEST_ID}`,
    collectionPath: 'request_summaries',
    allow: readFor(ACTIVE_SUBJECTS),
  },
  {
    key: 'requests.general',
    description: 'รายละเอียดงานทั่วไป: GM, ผู้ขอ, related (รวมฝ่ายที่รอ); list ทั้ง collection เฉพาะ GM',
    path: `requests/${GENERAL_REQUEST_ID}`,
    collectionPath: 'requests',
    allow: { ...readFor(DETAIL_SUBJECTS, ['get']), ...readFor(GM_SUBJECTS) },
  },
  {
    key: 'requests.confidential',
    description: 'รายละเอียดงานลับ: คนกลุ่มเดียวกับงานทั่วไป (watcher ติดตามงานลับไม่ได้อยู่แล้ว)',
    path: `requests/${SECRET_REQUEST_ID}`,
    collectionPath: 'requests',
    allow: { ...readFor(DETAIL_SUBJECTS, ['get']), ...readFor(GM_SUBJECTS) },
  },
  {
    key: 'request_summaries.confidential_absent',
    description: 'งานลับไม่มีสรุปสาธารณะ: อ่าน path นี้ได้ก็ต้องไม่พบ document (seed ไม่มี) — Rules ยังอนุญาตแบบ collection เดียวกัน',
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
  deniedEverywhere('requests.history', `requests/${GENERAL_REQUEST_ID}/history/evt-1`, 'history ผ่าน API ตรวจ parent ACL เท่านั้น'),
  deniedEverywhere('requests.comments', `requests/${GENERAL_REQUEST_ID}/comments/cmt-1`, 'คอมเมนต์ผ่าน API เท่านั้น'),
  deniedEverywhere('requests.gm_history', `requests/${GENERAL_REQUEST_ID}/gm_history/gmh-1`, 'watcher contribution/ข้อมูล GM ผ่าน API'),
  deniedEverywhere('requests.waiting_intervals', `requests/${GENERAL_REQUEST_ID}/waiting_intervals/1`, 'ช่วงรอ/recipients ผ่าน API'),
  deniedEverywhere('people', `people/${personOf('employee')}`, 'อีเมล/Slack ID: server เท่านั้น'),
  {
    key: 'people_picker',
    description: 'ID ชื่อ สำหรับเลือกคน: active อ่านได้',
    path: `people_picker/${personOf('employee')}`,
    collectionPath: 'people_picker',
    allow: readFor(ACTIVE_SUBJECTS),
  },
  {
    key: 'access.self',
    description: 'access ของตัวเอง: เจ้าของอ่านได้ (รวมบัญชีที่ปิดใช้งาน เพื่อแสดงว่าถูกปิด); นอก @tdfb.co/ไม่ verified ไม่ได้',
    path: ownUid,
    collectionPath: 'access',
    allow: readFor([...ACTIVE_SUBJECTS, 'inactive'], ['get']),
  },
  deniedEverywhere('access.other', `access/${OTHER_UID}`, 'access ของคนอื่น'),
  deniedEverywhere('gm_profiles', `gm_profiles/${personOf('gm_staff')}`, 'profile GM เต็ม: ผ่าน API'),
  {
    key: 'gm_profile_summaries',
    description: 'presence/focus แบบปลอดภัย (งานลับเป็น “งานภายใน”): active อ่านได้',
    path: `gm_profile_summaries/${personOf('gm_staff')}`,
    collectionPath: 'gm_profile_summaries',
    allow: readFor(ACTIVE_SUBJECTS),
  },
  {
    key: 'user_state.own',
    description: 'สถานะอ่านแล้วของตัวเอง: เจ้าของ (active) อ่านได้',
    path: (s) => `${ownState(s)}/${GENERAL_REQUEST_ID}`,
    collectionPath: ownState,
    allow: readFor(ACTIVE_SUBJECTS),
  },
  deniedEverywhere('user_state.other', `user_state/${personOf('requester')}/requests/${GENERAL_REQUEST_ID}`, 'ของคนอื่น'),
  {
    key: 'board_counters',
    description: '“งานภายใน X รายการ”: active อ่านได้',
    path: 'board_counters/public',
    collectionPath: 'board_counters',
    allow: readFor(ACTIVE_SUBJECTS),
  },
  ...(['locations/loc-wh300', 'areas/area-wh300-pack-1', 'qr_codes/qr-acl-1', 'content_pages/contact', 'announcements/ann-1'] as const).map(
    (path): AclResource => ({
      key: path.slice(0, path.indexOf('/')),
      description: 'ข้อมูลอ้างอิงที่ active อ่านได้ (§6.4)',
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
      'scheduled_work/job-1',
      'system_counters/request_sequence',
      'imports/imp-1',
      'integration_inbox/in-1',
      'integration_state/slack',
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
