// Request creation rules (S04): type, origin (C2), summary_title (U2), default sensitivity (C6)
// and the manual GM category (P7-UX-02). Pure: no Firestore, no clock, no network.

export const REQUEST_TYPES = ['maintenance', 'gm_task', 'document_request', 'document_intake'] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export const REQUEST_ORIGINS = ['requester', 'gm_on_behalf', 'gm_initiated'] as const;
export type RequestOrigin = (typeof REQUEST_ORIGINS)[number];

export const ROLES = ['requester', 'gm_staff', 'gm_admin', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

/**
 * The 7 GM categories (PRD §5.1): stable snake_case keys are stored, Thai names are display
 * labels only, so a label can be renamed without breaking stored data (D-S04-1).
 */
export const GM_CATEGORIES = {
  damage: 'บริหารสินค้า Damage',
  documents_admin: 'เอกสารและธุรการ',
  assets_facilities: 'ทรัพย์สินและอาคารสถานที่',
  purchasing_bills: 'จัดซื้อทั่วไปและบิล',
  government_compliance: 'ภาครัฐ กฎหมาย Compliance',
  improvement_projects: 'Project ปรับปรุงระบบ',
  employee_activities: 'กิจกรรมพนักงาน',
} as const;
export type GmCategory = keyof typeof GM_CATEGORIES;
export const GM_CATEGORY_KEYS = Object.keys(GM_CATEGORIES) as readonly GmCategory[];

/** D-S04-2: categories set automatically for service requests (gm_task is chosen by the GM). */
const SERVICE_CATEGORY = {
  maintenance: 'assets_facilities',
  document_request: 'documents_admin',
  document_intake: 'documents_admin',
} as const satisfies Record<ServiceDetails['type'], GmCategory>;

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

/** D-S04-4: a GM may turn the confidential flag on; nobody turns a contract/personnel default off here. */
export interface ConfidentialChoice {
  readonly markConfidential?: boolean | undefined;
  /** D-S05-6: required short note when a GM marks a general item (`sensitivity_reason` = `other`). */
  readonly confidentialNote?: string | undefined;
}

/** `sensitivity_reason`: C6 defaults plus `other` for a flag a GM sets on another matter (D-S05-6). */
export const SENSITIVITY_REASONS = ['contract', 'personnel', 'other'] as const;
export type SensitivityReason = (typeof SENSITIVITY_REASONS)[number];

/** FU-07: related persons chosen in a GM form; a confidential request needs the separate confirmation (C3). */
export interface RelatedChoice {
  readonly relatedPersonIds?: readonly string[] | undefined;
  readonly confirmConfidentialGrant?: boolean | undefined;
}

export type CreateRequestCommand =
  | ({ readonly kind: 'self'; readonly actor: Actor; readonly details: ServiceDetails } & ConfidentialChoice & RelatedChoice)
  | ({
      readonly kind: 'on_behalf';
      readonly actor: Actor;
      readonly requester: OnBehalfRequester;
      readonly details: ServiceDetails;
    } & ConfidentialChoice &
      RelatedChoice)
  | ({
      readonly kind: 'gm_task';
      readonly actor: Actor;
      readonly summaryTitle: string;
      /** Category key, chosen by the GM; there is no default (P7-UX-02, D-S04-1). */
      readonly category?: string | undefined;
      readonly sensitivitySubject: SensitivitySubject;
      readonly description?: string | undefined;
    } & ConfidentialChoice &
      RelatedChoice);

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
  readonly sensitivityReason?: SensitivityReason;
  /** Restricted detail: why a GM marked the item confidential (`other`, D-S05-6). */
  readonly sensitivityNote?: string;
  /** FU-07: related persons chosen in the GM form (absent when none). */
  readonly relatedPersonIds?: readonly string[];
  /** FU-07: on a confidential request, the related persons whose access the GM confirmed (C3, D-ACL-2). */
  readonly confidentialGrantIds?: readonly string[];
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

const GM_ROLES: readonly Role[] = ['gm_staff', 'gm_admin'];

function requireText(value: unknown, code: string, what: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new RequestRejected(code, `${what} is required`);
  return value.trim();
}

export function isGm(actor: Actor): boolean {
  return GM_ROLES.includes(actor.role);
}

function requireGm(actor: Actor): void {
  if (!isGm(actor)) {
    throw new RequestRejected('GM_ONLY', 'Only GM Staff or GM Admin can create GM tasks or open requests on behalf');
  }
}

/** `[อาการ] — [บริเวณ] · [สถานที่]`, or `[อาการ] · [สถานที่]` without an area (U2). */
export function maintenanceTitle(parts: {
  readonly symptomLabel: string;
  readonly areaLabel?: string | undefined;
  readonly locationLabel: string;
}): string {
  const symptom = requireText(parts.symptomLabel, 'TITLE_PART_EMPTY', 'symptom label');
  const location = requireText(parts.locationLabel, 'TITLE_PART_EMPTY', 'location label');
  if (parts.areaLabel === undefined) return `${symptom} · ${location}`;
  const area = requireText(parts.areaLabel, 'TITLE_PART_EMPTY', 'area label');
  return `${symptom} — ${area} · ${location}`;
}

/** C6: confidential by default only for contract and personnel matters, with the reason kept. */
export function defaultSensitivity(subject: SensitivitySubject): {
  readonly isConfidential: boolean;
  readonly sensitivityReason?: 'contract' | 'personnel';
} {
  if (subject === 'contract' || subject === 'personnel') return { isConfidential: true, sensitivityReason: subject };
  if (subject === 'general') return { isConfidential: false };
  throw new RequestRejected('SENSITIVITY_SUBJECT_REQUIRED', 'Answer whether this is a contract or personnel matter');
}

function sensitivityOf(subject: unknown) {
  if (!(SENSITIVITY_SUBJECTS as readonly unknown[]).includes(subject)) {
    throw new RequestRejected('SENSITIVITY_SUBJECT_REQUIRED', 'Answer whether this is a contract or personnel matter');
  }
  return defaultSensitivity(subject as SensitivitySubject);
}

/**
 * D-S04-4/5, D-S05-6: GM may turn the flag on; on a general item that needs a short note and
 * `sensitivity_reason` = `other`. A contract/personnel default cannot be switched off at creation
 * (unflagging is GM Admin + reason, C6); requesters cannot set it; repairs are never confidential.
 */
function applyConfidentialChoice<
  T extends { readonly type: RequestType; readonly isConfidential: boolean; readonly sensitivityReason?: SensitivityReason },
>(fields: T, actor: Actor, choice: ConfidentialChoice): T {
  const { markConfidential, confidentialNote } = choice;
  const gmMarksGeneralItem = markConfidential === true && !fields.isConfidential;
  if (confidentialNote !== undefined && !gmMarksGeneralItem) {
    throw new RequestRejected('CONFIDENTIAL_NOTE_NOT_APPLICABLE', 'A note is only kept when a GM marks a general item confidential');
  }
  if (markConfidential === undefined) return fields;
  if (!isGm(actor)) throw new RequestRejected('FLAG_NOT_ALLOWED', 'Only GM can set the confidential flag at creation');
  if (fields.type === 'maintenance') {
    if (markConfidential) {
      throw new RequestRejected('MAINTENANCE_NOT_CONFIDENTIAL', 'Repair requests are never confidential (D-S04-5)');
    }
    return fields;
  }
  if (!markConfidential) {
    if (fields.isConfidential) {
      throw new RequestRejected('DEFAULT_FLAG_LOCKED', 'Contract/personnel matters stay confidential; GM Admin can unflag later with a reason');
    }
    return fields;
  }
  if (fields.isConfidential) return fields;
  const sensitivityNote = requireText(confidentialNote, 'CONFIDENTIAL_NOTE_REQUIRED', 'confidential note');
  return { ...fields, isConfidential: true, sensitivityReason: 'other', sensitivityNote };
}

function serviceFields(details: ServiceDetails) {
  if (details.type === 'maintenance') {
    const title = maintenanceTitle({
      symptomLabel: details.symptom.label,
      areaLabel: details.area?.label,
      locationLabel: details.location.label,
    });
    // Anything the reporter typed (including a title) stays in the restricted description only (U2).
    return {
      type: details.type,
      summaryTitle: title,
      category: SERVICE_CATEGORY.maintenance,
      locationId: requireText(details.location.id, 'LOCATION_REQUIRED', 'location'),
      ...(details.area === undefined ? {} : { areaId: requireText(details.area.id, 'AREA_INVALID', 'area id') }),
      symptomKey: requireText(details.symptom.key, 'SYMPTOM_REQUIRED', 'symptom'),
      ...optionalDescription(details.description),
      isConfidential: false,
    };
  }
  if (details.type === 'document_request' || details.type === 'document_intake') {
    return {
      type: details.type,
      summaryTitle: requireText(details.summaryTitle, 'TITLE_REQUIRED', 'summary_title'),
      category: SERVICE_CATEGORY[details.type],
      ...optionalDescription(details.description),
      ...sensitivityOf(details.sensitivitySubject),
    };
  }
  throw new RequestRejected('TYPE_INVALID', 'Requests opened by or for an employee use a service type, not gm_task');
}

function optionalDescription(description: string | undefined) {
  return description === undefined || description.trim() === '' ? {} : { description };
}

function onBehalfRequester(requester: OnBehalfRequester) {
  const hasPerson = 'personId' in requester;
  const hasName = 'nameText' in requester;
  if (hasPerson === hasName) {
    throw new RequestRejected('REQUESTER_INVALID', 'Choose either a directory account or a typed name');
  }
  if (hasPerson) {
    const requesterId = requireText(requester.personId, 'REQUESTER_INVALID', 'requester account');
    return { requesterId, requiresRequesterConfirmation: true };
  }
  // A typed name is not an account: no requester_id, no notifications, closes when GM completes (C2).
  const requesterNameText = requireText(requester.nameText, 'REQUESTER_INVALID', 'requester name');
  return { requesterNameText, requiresRequesterConfirmation: false };
}

/** Validates a create command and returns the request to persist. Throws RequestRejected otherwise. */
export function createRequestDraft(command: CreateRequestCommand): RequestDraft {
  const createdById = requireText(command.actor.personId, 'ACTOR_INVALID', 'actor');

  switch (command.kind) {
    case 'self':
      return {
        ...applyConfidentialChoice(serviceFields(command.details), command.actor, command),
        source: 'web',
        origin: 'requester',
        createdById,
        requesterId: createdById,
        requiresRequesterConfirmation: true,
      };
    case 'on_behalf':
      requireGm(command.actor);
      return {
        ...applyConfidentialChoice(serviceFields(command.details), command.actor, command),
        source: 'web',
        origin: 'gm_on_behalf',
        createdById,
        ...onBehalfRequester(command.requester),
      };
    case 'gm_task': {
      requireGm(command.actor);
      if ('requesterId' in command || 'requester' in command || 'requesterNameText' in command) {
        throw new RequestRejected('GM_TASK_HAS_NO_REQUESTER', 'A gm_task has no requester (C2)');
      }
      const category = requireText(command.category, 'CATEGORY_REQUIRED', 'category');
      if (!Object.hasOwn(GM_CATEGORIES, category)) {
        throw new RequestRejected('CATEGORY_UNKNOWN', 'category must be one of the 7 GM category keys');
      }
      const draft = {
        type: 'gm_task' as const,
        source: 'web' as const,
        origin: 'gm_initiated' as const,
        createdById,
        summaryTitle: requireText(command.summaryTitle, 'TITLE_REQUIRED', 'summary_title'),
        category: category as GmCategory,
        ...optionalDescription(command.description),
        ...sensitivityOf(command.sensitivitySubject),
        requiresRequesterConfirmation: false,
      };
      return applyConfidentialChoice(draft, command.actor, command);
    }
    default:
      throw new RequestRejected('KIND_INVALID', 'Unknown create command');
  }
}
