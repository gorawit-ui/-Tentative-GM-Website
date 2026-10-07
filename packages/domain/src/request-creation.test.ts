// S04 — request creation: type, origin (C2), summary_title (U2), default sensitivity (C6),
// manual GM category (P7-UX-02). Fixture people/places are synthetic.
import { describe, expect, it } from 'vitest';
import {
  GM_CATEGORIES,
  GM_CATEGORY_KEYS,
  RequestRejected,
  createRequestDraft,
  defaultSensitivity,
  maintenanceTitle,
  type Actor,
  type CreateRequestCommand,
  type MaintenanceDetails,
} from './index';

const EMPLOYEE: Actor = { personId: 'person-employee-01', role: 'requester' };
const GM: Actor = { personId: 'person-gm-01', role: 'gm_staff' };
const GM_ADMIN: Actor = { personId: 'person-gm-admin-01', role: 'gm_admin' };

const AIRCON_WH300: MaintenanceDetails = {
  type: 'maintenance',
  location: { id: 'loc-wh300', label: 'WH300' },
  area: { id: 'area-wh300-pack-1', label: 'ห้องแพ็คชั้น 1' },
  symptom: { key: 'aircon', label: 'แอร์' },
  description: 'แอร์มีน้ำหยดตรงโต๊ะแพ็คของคุณสมมติ',
};
const AIRCON_FAC16: MaintenanceDetails = {
  type: 'maintenance',
  location: { id: 'loc-fac16', label: 'FAC16' },
  symptom: { key: 'aircon', label: 'แอร์' },
};

/** The error code thrown by `action`, failing the test if it does not throw RequestRejected. */
function rejectionCode(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    if (error instanceof RequestRejected) return error.code;
    throw error;
  }
  throw new Error('expected RequestRejected');
}

describe('U2: maintenance summary_title is built by the server from form choices', () => {
  it('with an area: "แอร์ — ห้องแพ็คชั้น 1 · WH300"', () => {
    expect(maintenanceTitle({ symptomLabel: 'แอร์', areaLabel: 'ห้องแพ็คชั้น 1', locationLabel: 'WH300' })).toBe(
      'แอร์ — ห้องแพ็คชั้น 1 · WH300',
    );
    expect(createRequestDraft({ kind: 'self', actor: EMPLOYEE, details: AIRCON_WH300 }).summaryTitle).toBe(
      'แอร์ — ห้องแพ็คชั้น 1 · WH300',
    );
  });

  it('without an area: "แอร์ · FAC16"', () => {
    expect(maintenanceTitle({ symptomLabel: 'แอร์', locationLabel: 'FAC16' })).toBe('แอร์ · FAC16');
    expect(createRequestDraft({ kind: 'self', actor: EMPLOYEE, details: AIRCON_FAC16 }).summaryTitle).toBe(
      'แอร์ · FAC16',
    );
  });

  it('symptom “อื่นๆ” uses the word อื่นๆ, never the typed description', () => {
    const other: MaintenanceDetails = {
      type: 'maintenance',
      location: { id: 'loc-office-195', label: 'Office 195' },
      symptom: { key: 'other', label: 'อื่นๆ' },
      description: 'ประตูห้องประชุมปิดไม่สนิท',
    };
    const draft = createRequestDraft({ kind: 'self', actor: EMPLOYEE, details: other });
    expect(draft.summaryTitle).toBe('อื่นๆ · Office 195');
    expect(draft.description).toBe('ประตูห้องประชุมปิดไม่สนิท');
  });

  it('ignores a title the reporter sends and never copies the free text into it', () => {
    const withTypedTitle = { ...AIRCON_WH300, summaryTitle: 'แอร์ห้องคุณสมมติพังอีกแล้ว' } as MaintenanceDetails;
    const draft = createRequestDraft({ kind: 'self', actor: EMPLOYEE, details: withTypedTitle });
    expect(draft.summaryTitle).toBe('แอร์ — ห้องแพ็คชั้น 1 · WH300');
    expect(draft.summaryTitle).not.toContain('คุณสมมติ');
    expect(draft.description).toBe(AIRCON_WH300.description);
  });

  it('keeps location, area and symptom ids for the request', () => {
    const draft = createRequestDraft({ kind: 'self', actor: EMPLOYEE, details: AIRCON_WH300 });
    expect(draft).toMatchObject({ locationId: 'loc-wh300', areaId: 'area-wh300-pack-1', symptomKey: 'aircon' });
  });

  it.each([
    ['empty symptom', { symptomLabel: ' ', locationLabel: 'WH300' }],
    ['empty location', { symptomLabel: 'แอร์', locationLabel: '' }],
    ['empty area given', { symptomLabel: 'แอร์', areaLabel: '', locationLabel: 'WH300' }],
  ])('rejects %s', (_label, parts) => {
    expect(rejectionCode(() => maintenanceTitle(parts))).toBe('TITLE_PART_EMPTY');
  });
});

describe('C2: origin and requester', () => {
  it('an employee opening their own request: origin requester, requester = creator, confirmation required', () => {
    expect(createRequestDraft({ kind: 'self', actor: EMPLOYEE, details: AIRCON_FAC16 })).toMatchObject({
      type: 'maintenance',
      source: 'web',
      origin: 'requester',
      createdById: 'person-employee-01',
      requesterId: 'person-employee-01',
      requiresRequesterConfirmation: true,
    });
  });

  it('GM on behalf of a directory account: origin gm_on_behalf, real requester confirms', () => {
    const draft = createRequestDraft({
      kind: 'on_behalf',
      actor: GM,
      requester: { personId: 'person-employee-02' },
      details: AIRCON_FAC16,
    });
    expect(draft).toMatchObject({
      origin: 'gm_on_behalf',
      createdById: 'person-gm-01',
      requesterId: 'person-employee-02',
      requiresRequesterConfirmation: true,
    });
    expect(draft.requesterNameText).toBeUndefined();
  });

  it('GM on behalf with only a typed name: no requester_id and no requester confirmation step', () => {
    const draft = createRequestDraft({
      kind: 'on_behalf',
      actor: GM,
      requester: { nameText: 'คุณสมมติ ไม่มีบัญชี' },
      details: AIRCON_FAC16,
    });
    expect(draft).toMatchObject({
      origin: 'gm_on_behalf',
      createdById: 'person-gm-01',
      requesterNameText: 'คุณสมมติ ไม่มีบัญชี',
      requiresRequesterConfirmation: false,
    });
    expect('requesterId' in draft).toBe(false);
    expect(draft.summaryTitle).not.toContain('คุณสมมติ');
  });

  it('gm_task: origin gm_initiated and no requester_id', () => {
    const draft = createRequestDraft({
      kind: 'gm_task',
      actor: GM,
      summaryTitle: 'ติดตามเอกสาร BOI — หน่วยงานรัฐ',
      category: 'government_compliance',
      sensitivitySubject: 'general',
    });
    expect(draft).toMatchObject({
      type: 'gm_task',
      source: 'web',
      origin: 'gm_initiated',
      createdById: 'person-gm-01',
      category: 'government_compliance',
      requiresRequesterConfirmation: false,
    });
    expect('requesterId' in draft).toBe(false);
    expect('requesterNameText' in draft).toBe(false);
  });

  it('a gm_task cannot carry a requester', () => {
    const command = {
      kind: 'gm_task',
      actor: GM,
      summaryTitle: 'จัดซื้อเก้าอี้ — ทีมคลัง',
      category: 'purchasing_bills',
      sensitivitySubject: 'general',
      requesterId: 'person-employee-01',
    } as unknown as CreateRequestCommand;
    expect(rejectionCode(() => createRequestDraft(command))).toBe('GM_TASK_HAS_NO_REQUESTER');
  });

  it.each([
    ['gm_task by a non-GM', { kind: 'gm_task', actor: EMPLOYEE, summaryTitle: 'งาน', category: 'employee_activities', sensitivitySubject: 'general' }],
    ['on-behalf by a non-GM', { kind: 'on_behalf', actor: EMPLOYEE, requester: { personId: 'person-employee-02' }, details: AIRCON_FAC16 }],
  ])('rejects %s', (_label, command) => {
    expect(rejectionCode(() => createRequestDraft(command as CreateRequestCommand))).toBe('GM_ONLY');
  });

  it('GM Admin can also create a gm_task', () => {
    const draft = createRequestDraft({
      kind: 'gm_task',
      actor: GM_ADMIN,
      summaryTitle: 'ปิดเพจปลอม — รอแพลตฟอร์ม',
      category: 'government_compliance',
      sensitivitySubject: 'general',
    });
    expect(draft.createdById).toBe('person-gm-admin-01');
  });

  it.each([
    ['blank typed name', { nameText: '   ' }],
    ['blank person id', { personId: '' }],
    ['both an account and a typed name', { personId: 'person-employee-02', nameText: 'คุณสมมติ' }],
  ])('rejects an on-behalf requester with %s', (_label, requester) => {
    const command = { kind: 'on_behalf', actor: GM, requester, details: AIRCON_FAC16 } as unknown as CreateRequestCommand;
    expect(rejectionCode(() => createRequestDraft(command))).toBe('REQUESTER_INVALID');
  });

  it('a gm_task is not opened through the on-behalf path (on-behalf uses the service forms)', () => {
    const command = {
      kind: 'on_behalf',
      actor: GM,
      requester: { personId: 'person-employee-02' },
      details: { type: 'gm_task' },
    } as unknown as CreateRequestCommand;
    expect(rejectionCode(() => createRequestDraft(command))).toBe('TYPE_INVALID');
  });
});

describe('C6: confidential by default only for contract and personnel matters', () => {
  it.each([
    ['contract', true, 'contract'],
    ['personnel', true, 'personnel'],
    ['general', false, undefined],
  ] as const)('defaultSensitivity(%s)', (subject, isConfidential, sensitivityReason) => {
    expect(defaultSensitivity(subject)).toEqual(
      sensitivityReason === undefined ? { isConfidential } : { isConfidential, sensitivityReason },
    );
  });

  it.each([
    ['document_request', 'ขอสำเนาสัญญาเช่าคลัง — ทีมบัญชี', 'contract'],
    ['document_intake', 'ส่งเอกสารบุคคล — ทีม HR', 'personnel'],
  ] as const)('%s about a %s matter is confidential with the reason stored', (type, summaryTitle, subject) => {
    const draft = createRequestDraft({
      kind: 'self',
      actor: EMPLOYEE,
      details: { type, summaryTitle, sensitivitySubject: subject },
    });
    expect(draft).toMatchObject({ isConfidential: true, sensitivityReason: subject });
  });

  it.each(['ขอ ภ.พ.20 — ทีมบัญชี', 'ขอหนังสือรับรองบริษัท — ทีมบัญชี'])(
    'general company document "%s" is not confidential by default',
    (summaryTitle) => {
      const draft = createRequestDraft({
        kind: 'self',
        actor: EMPLOYEE,
        details: { type: 'document_request', summaryTitle, sensitivitySubject: 'general' },
      });
      expect(draft.isConfidential).toBe(false);
      expect('sensitivityReason' in draft).toBe(false);
    },
  );

  it('a GM task about a personnel matter is confidential by default (US-19)', () => {
    const draft = createRequestDraft({
      kind: 'gm_task',
      actor: GM,
      summaryTitle: 'เรื่องบุคคล — ทีม HR',
      category: 'documents_admin',
      sensitivitySubject: 'personnel',
    });
    expect(draft).toMatchObject({ isConfidential: true, sensitivityReason: 'personnel' });
  });

  it('a repair request is not confidential by default', () => {
    expect(createRequestDraft({ kind: 'self', actor: EMPLOYEE, details: AIRCON_WH300 }).isConfidential).toBe(false);
  });

  it('a document or GM task without an answer to “สัญญาหรือเรื่องบุคคลหรือไม่” is rejected, not defaulted', () => {
    const document = {
      kind: 'self',
      actor: EMPLOYEE,
      details: { type: 'document_request', summaryTitle: 'ขอเอกสาร — ทีมบัญชี' },
    } as unknown as CreateRequestCommand;
    const task = {
      kind: 'gm_task',
      actor: GM,
      summaryTitle: 'งานติดตาม',
      category: 'employee_activities',
    } as unknown as CreateRequestCommand;
    expect(rejectionCode(() => createRequestDraft(document))).toBe('SENSITIVITY_SUBJECT_REQUIRED');
    expect(rejectionCode(() => createRequestDraft(task))).toBe('SENSITIVITY_SUBJECT_REQUIRED');
  });
});

describe('P7-UX-02: manual GM category is required and has no default', () => {
  it('D-S04-1: 7 stable snake_case keys, each with its Thai label', () => {
    expect(GM_CATEGORIES).toEqual({
      damage: 'บริหารสินค้า Damage',
      documents_admin: 'เอกสารและธุรการ',
      assets_facilities: 'ทรัพย์สินและอาคารสถานที่',
      purchasing_bills: 'จัดซื้อทั่วไปและบิล',
      government_compliance: 'ภาครัฐ กฎหมาย Compliance',
      improvement_projects: 'Project ปรับปรุงระบบ',
      employee_activities: 'กิจกรรมพนักงาน',
    });
    expect(GM_CATEGORY_KEYS).toHaveLength(7);
  });

  it('D-S04-1: a Thai label is not accepted where the key is required', () => {
    const command: CreateRequestCommand = {
      kind: 'gm_task',
      actor: GM,
      summaryTitle: 'ติดตาม Damage — ทีมคลัง',
      category: 'บริหารสินค้า Damage',
      sensitivitySubject: 'general',
    };
    expect(rejectionCode(() => createRequestDraft(command))).toBe('CATEGORY_UNKNOWN');
  });

  it.each([undefined, '', '   '])('rejects a gm_task with category %j instead of defaulting', (category) => {
    const command: CreateRequestCommand = {
      kind: 'gm_task',
      actor: GM,
      summaryTitle: 'ติดตาม Damage — ทีมคลัง',
      category,
      sensitivitySubject: 'general',
    };
    expect(rejectionCode(() => createRequestDraft(command))).toBe('CATEGORY_REQUIRED');
  });

  it('never fills in purchasing_bills (“จัดซื้อทั่วไปและบิล”) on its own', () => {
    const command = {
      kind: 'gm_task',
      actor: GM,
      summaryTitle: 'ติดตาม Damage — ทีมคลัง',
      sensitivitySubject: 'general',
    } as CreateRequestCommand;
    expect(() => createRequestDraft(command)).toThrow(RequestRejected);
  });

  it('rejects a category outside the 7', () => {
    const command: CreateRequestCommand = {
      kind: 'gm_task',
      actor: GM,
      summaryTitle: 'ติดตามงาน',
      category: 'อื่นๆ',
      sensitivitySubject: 'general',
    };
    expect(rejectionCode(() => createRequestDraft(command))).toBe('CATEGORY_UNKNOWN');
  });

  it.each(GM_CATEGORY_KEYS)('accepts %s', (category) => {
    const draft = createRequestDraft({
      kind: 'gm_task',
      actor: GM,
      summaryTitle: 'ติดตามงาน',
      category,
      sensitivitySubject: 'general',
    });
    expect(draft.category).toBe(category);
  });
});

describe('titles that people type (gm_task and documents)', () => {
  it.each(['', '   '])('rejects an empty summary_title %j', (summaryTitle) => {
    const command: CreateRequestCommand = {
      kind: 'gm_task',
      actor: GM,
      summaryTitle,
      category: 'employee_activities',
      sensitivitySubject: 'general',
    };
    expect(rejectionCode(() => createRequestDraft(command))).toBe('TITLE_REQUIRED');
  });

  it('trims the typed title', () => {
    const draft = createRequestDraft({
      kind: 'gm_task',
      actor: GM,
      summaryTitle: '  จัดงานปีใหม่ — ทีม GM  ',
      category: 'employee_activities',
      sensitivitySubject: 'general',
    });
    expect(draft.summaryTitle).toBe('จัดงานปีใหม่ — ทีม GM');
  });
});

describe('D-S04-2: automatic category for service requests', () => {
  it('maintenance → assets_facilities', () => {
    expect(createRequestDraft({ kind: 'self', actor: EMPLOYEE, details: AIRCON_FAC16 }).category).toBe('assets_facilities');
  });

  it.each(['document_request', 'document_intake'] as const)('%s → documents_admin', (type) => {
    const draft = createRequestDraft({
      kind: 'self',
      actor: EMPLOYEE,
      details: { type, summaryTitle: 'ขอ ภ.พ.20 — ทีมบัญชี', sensitivitySubject: 'general' },
    });
    expect(draft.category).toBe('documents_admin');
  });

  it('on-behalf requests get the same automatic category', () => {
    const draft = createRequestDraft({
      kind: 'on_behalf',
      actor: GM,
      requester: { nameText: 'คุณสมมติ ไม่มีบัญชี' },
      details: AIRCON_WH300,
    });
    expect(draft.category).toBe('assets_facilities');
  });
});

describe('D-S04-4: who may change the confidential flag at creation', () => {
  it('a GM may mark a general gm_task confidential', () => {
    const draft = createRequestDraft({
      kind: 'gm_task',
      actor: GM,
      summaryTitle: 'ติดตามเรื่องภายใน — ทีม GM',
      category: 'documents_admin',
      sensitivitySubject: 'general',
      markConfidential: true,
      confidentialNote: 'เกี่ยวกับข้อพิพาทกับคู่ค้า',
    });
    expect(draft.isConfidential).toBe(true);
  });

  it('a GM opening a general document on behalf may mark it confidential', () => {
    const draft = createRequestDraft({
      kind: 'on_behalf',
      actor: GM,
      requester: { personId: 'person-employee-02' },
      details: { type: 'document_request', summaryTitle: 'ขอเอกสาร — ทีมบัญชี', sensitivitySubject: 'general' },
      markConfidential: true,
      confidentialNote: 'มีข้อมูลเงินเดือนรวมอยู่',
    });
    expect(draft.isConfidential).toBe(true);
  });

  it.each(['contract', 'personnel'] as const)('a GM cannot switch off the %s default at creation (unflagging is GM Admin + reason, C6)', (subject) => {
    for (const actor of [GM, GM_ADMIN]) {
      const command: CreateRequestCommand = {
        kind: 'gm_task',
        actor,
        summaryTitle: 'เรื่องภายใน — ทีม HR',
        category: 'documents_admin',
        sensitivitySubject: subject,
        markConfidential: false,
      };
      expect(rejectionCode(() => createRequestDraft(command))).toBe('DEFAULT_FLAG_LOCKED');
    }
  });

  it('a regular requester cannot set the flag', () => {
    const command: CreateRequestCommand = {
      kind: 'self',
      actor: EMPLOYEE,
      details: { type: 'document_request', summaryTitle: 'ขอเอกสาร — ทีมบัญชี', sensitivitySubject: 'general' },
      markConfidential: true,
    };
    expect(rejectionCode(() => createRequestDraft(command))).toBe('FLAG_NOT_ALLOWED');
  });

  it('D-S04-5: a repair request is never confidential, even when a GM asks', () => {
    const command: CreateRequestCommand = {
      kind: 'on_behalf',
      actor: GM,
      requester: { personId: 'person-employee-02' },
      details: AIRCON_FAC16,
      markConfidential: true,
    };
    expect(rejectionCode(() => createRequestDraft(command))).toBe('MAINTENANCE_NOT_CONFIDENTIAL');
  });

  it('markConfidential false on a general item simply keeps it non-confidential', () => {
    const draft = createRequestDraft({
      kind: 'gm_task',
      actor: GM,
      summaryTitle: 'จัดงานปีใหม่ — ทีม GM',
      category: 'employee_activities',
      sensitivitySubject: 'general',
      markConfidential: false,
    });
    expect(draft.isConfidential).toBe(false);
  });
});

describe('D-S04-6: a Viewer can open their own request', () => {
  it('creates a self request with the viewer as requester', () => {
    const viewer: Actor = { personId: 'person-viewer-01', role: 'viewer' };
    expect(createRequestDraft({ kind: 'self', actor: viewer, details: AIRCON_FAC16 })).toMatchObject({
      origin: 'requester',
      requesterId: 'person-viewer-01',
    });
  });
});

describe('D-S05-6: GM-marked confidential flag uses sensitivity_reason other with a note', () => {
  it('a GM-marked general gm_task gets reason other and keeps the note as restricted detail', () => {
    const draft = createRequestDraft({
      kind: 'gm_task',
      actor: GM,
      summaryTitle: 'ติดตามเรื่องภายใน — ทีม GM',
      category: 'documents_admin',
      sensitivitySubject: 'general',
      markConfidential: true,
      confidentialNote: '  เกี่ยวกับข้อพิพาทกับคู่ค้า  ',
    });
    expect(draft).toMatchObject({
      isConfidential: true,
      sensitivityReason: 'other',
      sensitivityNote: 'เกี่ยวกับข้อพิพาทกับคู่ค้า',
    });
  });

  it.each([undefined, '', '   '])('the note is required when a GM marks a general item (%j)', (confidentialNote) => {
    const command: CreateRequestCommand = {
      kind: 'gm_task',
      actor: GM,
      summaryTitle: 'ติดตามเรื่องภายใน — ทีม GM',
      category: 'documents_admin',
      sensitivitySubject: 'general',
      markConfidential: true,
      confidentialNote,
    };
    expect(rejectionCode(() => createRequestDraft(command))).toBe('CONFIDENTIAL_NOTE_REQUIRED');
  });

  it.each(['contract', 'personnel'] as const)('marking a %s item keeps its own reason and needs no note', (subject) => {
    const draft = createRequestDraft({
      kind: 'gm_task',
      actor: GM,
      summaryTitle: 'เรื่องภายใน — ทีม HR',
      category: 'documents_admin',
      sensitivitySubject: subject,
      markConfidential: true,
    });
    expect(draft).toMatchObject({ isConfidential: true, sensitivityReason: subject });
    expect(draft).not.toHaveProperty('sensitivityNote');
  });

  it('a note without a GM-marked flag is rejected rather than silently dropped', () => {
    const command: CreateRequestCommand = {
      kind: 'gm_task',
      actor: GM,
      summaryTitle: 'จัดงานปีใหม่ — ทีม GM',
      category: 'employee_activities',
      sensitivitySubject: 'general',
      confidentialNote: 'ไม่ได้ติดธง',
    };
    expect(rejectionCode(() => createRequestDraft(command))).toBe('CONFIDENTIAL_NOTE_NOT_APPLICABLE');
  });
});

describe('FU-07: related persons chosen in the GM forms (Part 2 GM ริเริ่มเอง, UI-04)', () => {
  const RELATED_A = 'person-related-01';
  const RELATED_B = 'person-related-02';
  const generalTask = { kind: 'gm_task', actor: GM, summaryTitle: 'จัดงานปีใหม่', category: 'employee_activities', sensitivitySubject: 'general' } as const;
  const contractTask = { ...generalTask, summaryTitle: 'ต่อสัญญาเช่ารถส่งของ', category: 'documents_admin', sensitivitySubject: 'contract' } as const;

  it('a general gm_task keeps the chosen related persons without any grant', () => {
    const draft = createRequestDraft({ ...generalTask, relatedPersonIds: [RELATED_A, RELATED_B, RELATED_A] });
    expect(draft.relatedPersonIds).toEqual([RELATED_A, RELATED_B]);
    expect(draft).not.toHaveProperty('confidentialGrantIds');
  });

  it('a confidential gm_task with related persons needs the separate confirmation (C3), not pre-ticked', () => {
    expect(rejectionCode(() => createRequestDraft({ ...contractTask, relatedPersonIds: [RELATED_A] }))).toBe('CONFIDENTIAL_GRANT_REQUIRED');
    expect(rejectionCode(() => createRequestDraft({ ...contractTask, relatedPersonIds: [RELATED_A], confirmConfidentialGrant: false }))).toBe(
      'CONFIDENTIAL_GRANT_REQUIRED',
    );
  });

  it('with the confirmation, every related person is recorded in the grant list', () => {
    const draft = createRequestDraft({ ...contractTask, relatedPersonIds: [RELATED_A, RELATED_B], confirmConfidentialGrant: true });
    expect(draft).toMatchObject({ isConfidential: true, relatedPersonIds: [RELATED_A, RELATED_B], confidentialGrantIds: [RELATED_A, RELATED_B] });
  });

  it('a GM marking a general task confidential at creation also confirms the related persons', () => {
    const marked = { ...generalTask, markConfidential: true, confidentialNote: 'เรื่องภายในทีม', relatedPersonIds: [RELATED_A] } as const;
    expect(rejectionCode(() => createRequestDraft(marked))).toBe('CONFIDENTIAL_GRANT_REQUIRED');
    expect(createRequestDraft({ ...marked, confirmConfidentialGrant: true })).toMatchObject({ confidentialGrantIds: [RELATED_A] });
  });

  it('on behalf: the real requester is not repeated as a related person and needs no grant', () => {
    const draft = createRequestDraft({
      kind: 'on_behalf',
      actor: GM,
      requester: { personId: 'person-employee-03' },
      details: { type: 'document_request', summaryTitle: 'ขอหนังสือรับรองเงินเดือน', sensitivitySubject: 'personnel' },
      relatedPersonIds: ['person-employee-03', RELATED_A],
      confirmConfidentialGrant: true,
    });
    expect(draft).toMatchObject({ requesterId: 'person-employee-03', relatedPersonIds: [RELATED_A], confidentialGrantIds: [RELATED_A] });
  });

  it('no related persons: nothing to confirm and no related/grant fields', () => {
    const draft = createRequestDraft(contractTask);
    expect(draft).not.toHaveProperty('relatedPersonIds');
    expect(draft).not.toHaveProperty('confidentialGrantIds');
  });

  it('the requester’s own form cannot add related persons', () => {
    expect(rejectionCode(() => createRequestDraft({ kind: 'self', actor: EMPLOYEE, details: AIRCON_FAC16, relatedPersonIds: [RELATED_A] }))).toBe(
      'RELATED_NOT_ALLOWED',
    );
  });
});
