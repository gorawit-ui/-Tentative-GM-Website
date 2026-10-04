// Request creation rules (S04): type, origin (C2), summary_title (U2), default sensitivity (C6)
// and the manual GM category (P7-UX-02). Pure: no Firestore, no clock, no network.

export const REQUEST_TYPES = ['maintenance', 'gm_task', 'document_request', 'document_intake'] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export const REQUEST_ORIGINS = ['requester', 'gm_on_behalf', 'gm_initiated'] as const;
export type RequestOrigin = (typeof REQUEST_ORIGINS)[number];

export const ROLES = ['requester', 'gm_staff', 'gm_admin', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

/** The 7 GM categories, exactly as named in PRD §5.1 / Part 2 §1.2 / Part 6 §6.6. */
export const GM_CATEGORIES = [
  'บริหารสินค้า Damage',
  'เอกสารและธุรการ',
  'ทรัพย์สินและอาคารสถานที่',
  'จัดซื้อทั่วไปและบิล',
  'ภาครัฐ กฎหมาย Compliance',
  'Project ปรับปรุงระบบ',
  'กิจกรรมพนักงาน',
] as const;
export type GmCategory = (typeof GM_CATEGORIES)[number];

/** Answer to the form question “สัญญาหรือเรื่องบุคคลหรือไม่” (C6, Part 2 F02). */
export const SENSITIVITY_SUBJECTS = ['contract', 'personnel', 'general'] as const;
export type SensitivitySubject = (typeof SENSITIVITY_SUBJECTS)[number];

export interface Actor {
  readonly personId: string;
  readonly role: Role;
}

export interface Labelled {
  readonly id: string;
  readonly label: string;
}

export interface MaintenanceDetails {
  readonly type: 'maintenance';
  readonly location: Labelled;
  readonly area?: Labelled | undefined;
  readonly symptom: { readonly key: string; readonly label: string };
  /** Free text typed by the reporter: restricted detail, never the board title (U2). */
  readonly description?: string | undefined;
}

export interface DocumentDetails {
  readonly type: 'document_request' | 'document_intake';
  readonly summaryTitle: string;
  readonly sensitivitySubject: SensitivitySubject;
  readonly description?: string | undefined;
}

export type ServiceDetails = MaintenanceDetails | DocumentDetails;

/** Who the on-behalf request is for: a directory account, or a name typed as text (Part 2 F03). */
export type OnBehalfRequester = { readonly personId: string } | { readonly nameText: string };

export type CreateRequestCommand =
  | { readonly kind: 'self'; readonly actor: Actor; readonly details: ServiceDetails }
  | {
      readonly kind: 'on_behalf';
      readonly actor: Actor;
      readonly requester: OnBehalfRequester;
      readonly details: ServiceDetails;
    }
  | {
      readonly kind: 'gm_task';
      readonly actor: Actor;
      readonly summaryTitle: string;
      /** Must be chosen by the GM; there is no default (P7-UX-02). */
      readonly category?: string | undefined;
      readonly sensitivitySubject: SensitivitySubject;
      readonly description?: string | undefined;
    };

/** Domain result of a valid create command; persistence (A01) maps it to Firestore fields. */
export interface RequestDraft {
  readonly type: RequestType;
  readonly source: 'web';
  readonly origin: RequestOrigin;
  readonly createdById: string;
  /** The real requester's person ID; absent for gm_task and text-name on-behalf requests. */
  readonly requesterId?: string;
  /** On-behalf requester typed as text: restricted detail, no account, no confirmation. */
  readonly requesterNameText?: string;
  readonly summaryTitle: string;
  readonly category?: GmCategory;
  readonly locationId?: string;
  readonly areaId?: string;
  readonly symptomKey?: string;
  readonly description?: string;
  readonly isConfidential: boolean;
  readonly sensitivityReason?: 'contract' | 'personnel';
  /** True only when a real requester account must confirm after GM completes (C2, Part 6 §6.6). */
  readonly requiresRequesterConfirmation: boolean;
}

export class RequestRejected extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'RequestRejected';
    this.code = code;
  }
}

export function maintenanceTitle(_parts: {
  readonly symptomLabel: string;
  readonly areaLabel?: string | undefined;
  readonly locationLabel: string;
}): string {
  throw new Error('maintenanceTitle: not implemented yet (S04)');
}

export function defaultSensitivity(_subject: SensitivitySubject): {
  readonly isConfidential: boolean;
  readonly sensitivityReason?: 'contract' | 'personnel';
} {
  throw new Error('defaultSensitivity: not implemented yet (S04)');
}

export function createRequestDraft(_command: CreateRequestCommand): RequestDraft {
  throw new Error('createRequestDraft: not implemented yet (S04)');
}
