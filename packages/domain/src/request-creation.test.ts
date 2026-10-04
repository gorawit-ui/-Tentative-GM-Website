// S04 — request creation: type, origin (C2), summary_title (U2), default sensitivity (C6),
// manual GM category (P7-UX-02). Fixture people/places are synthetic.
import { describe, expect, it } from 'vitest';
import {
  GM_CATEGORIES,
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
      category: 'ภาครัฐ กฎหมาย Compliance',
      sensitivitySubject: 'general',
    });
    expect(draft).toMatchObject({
      type: 'gm_task',
      source: 'web',
      origin: 'gm_initiated',
      createdById: 'person-gm-01',
      category: 'ภาครัฐ กฎหมาย Compliance',
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
      category: 'จัดซื้อทั่วไปและบิล',
      sensitivitySubject: 'general',
      requesterId: 'person-employee-01',
    } as unknown as CreateRequestCommand;
    expect(rejectionCode(() => createRequestDraft(command))).toBe('GM_TASK_HAS_NO_REQUESTER');
  });

  it.each([
    ['gm_task by a non-GM', { kind: 'gm_task', actor: EMPLOYEE, summaryTitle: 'งาน', category: 'กิจกรรมพนักงาน', sensitivitySubject: 'general' }],
    ['on-behalf by a non-GM', { kind: 'on_behalf', actor: EMPLOYEE, requester: { personId: 'person-employee-02' }, details: AIRCON_FAC16 }],
  ])('rejects %s', (_label, command) => {
    expect(rejectionCode(() => createRequestDraft(command as CreateRequestCommand))).toBe('GM_ONLY');
  });

  it('GM Admin can also create a gm_task', () => {
    const draft = createRequestDraft({
      kind: 'gm_task',
      actor: GM_ADMIN,
      summaryTitle: 'ปิดเพจปลอม — รอแพลตฟอร์ม',
      category: 'ภาครัฐ กฎหมาย Compliance',
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
      category: 'เอกสารและธุรการ',
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
      category: 'กิจกรรมพนักงาน',
    } as unknown as CreateRequestCommand;
    expect(rejectionCode(() => createRequestDraft(document))).toBe('SENSITIVITY_SUBJECT_REQUIRED');
    expect(rejectionCode(() => createRequestDraft(task))).toBe('SENSITIVITY_SUBJECT_REQUIRED');
  });
});

describe('P7-UX-02: manual GM category is required and has no default', () => {
  it('lists exactly the 7 GM categories', () => {
    expect(GM_CATEGORIES).toHaveLength(7);
    expect(GM_CATEGORIES).toContain('จัดซื้อทั่วไปและบิล');
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

  it('never fills in “จัดซื้อทั่วไปและบิล” on its own', () => {
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

  it.each(GM_CATEGORIES)('accepts %s', (category) => {
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
      category: 'กิจกรรมพนักงาน',
      sensitivitySubject: 'general',
    };
    expect(rejectionCode(() => createRequestDraft(command))).toBe('TITLE_REQUIRED');
  });

  it('trims the typed title', () => {
    const draft = createRequestDraft({
      kind: 'gm_task',
      actor: GM,
      summaryTitle: '  จัดงานปีใหม่ — ทีม GM  ',
      category: 'กิจกรรมพนักงาน',
      sensitivitySubject: 'general',
    });
    expect(draft.summaryTitle).toBe('จัดงานปีใหม่ — ทีม GM');
  });
});
