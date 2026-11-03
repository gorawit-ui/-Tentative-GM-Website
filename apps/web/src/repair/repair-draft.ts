// A14 / FU-47 (D-A12-5): what the repair form keeps while it is being filled — in this tab's
// sessionStorage only (never localStorage, IndexedDB or a cache): the choices, the text, the send's
// command ID (so a resend after a reload is the same request) and the matches answered “ไม่ใช่”. Never a
// photo. It belongs to the person who wrote it, is removed after a successful send, and logout empties
// sessionStorage altogether (device.ts) because phones at the site are shared. A storage that refuses
// (private mode, full) never stops the form.

export const REPAIR_DRAFT_KEY = 'gm.repair.draft';
const VERSION = 1;

export interface RepairDraft {
  readonly personId: string;
  readonly step: 1 | 2 | 3 | 4;
  readonly locationId?: string | undefined;
  /** `''` = “ไม่ระบุ”. */
  readonly areaId?: string | undefined;
  readonly symptomKey?: string | undefined;
  readonly description: string;
  readonly commandId: string;
  readonly dismissed: readonly string[];
}

const text = (value: unknown) => (typeof value === 'string' ? value : undefined);

function quietly<T>(work: () => T, fallback: T): T {
  try {
    return work();
  } catch {
    return fallback;
  }
}

export function saveRepairDraft(storage: Storage, draft: RepairDraft): void {
  // Only these fields: nothing else handed in (a photo, a data URL) is ever written.
  const stored = {
    v: VERSION,
    personId: draft.personId,
    step: draft.step,
    ...(draft.locationId === undefined ? {} : { locationId: draft.locationId }),
    ...(draft.areaId === undefined ? {} : { areaId: draft.areaId }),
    ...(draft.symptomKey === undefined ? {} : { symptomKey: draft.symptomKey }),
    description: draft.description,
    commandId: draft.commandId,
    dismissed: [...draft.dismissed],
  };
  quietly(() => storage.setItem(REPAIR_DRAFT_KEY, JSON.stringify(stored)), undefined);
}

/** The draft of `personId`, if there is a usable one; anything else found is removed. */
export function loadRepairDraft(storage: Storage, personId: string): RepairDraft | undefined {
  const raw = quietly(() => storage.getItem(REPAIR_DRAFT_KEY), null);
  if (raw === null) return undefined;
  const parsed = quietly(() => JSON.parse(raw) as Record<string, unknown>, undefined);
  const step = parsed?.step;
  const usable =
    parsed !== undefined &&
    parsed !== null &&
    parsed.v === VERSION &&
    parsed.personId === personId &&
    (step === 1 || step === 2 || step === 3 || step === 4) &&
    typeof parsed.description === 'string' &&
    typeof parsed.commandId === 'string' &&
    Array.isArray(parsed.dismissed);
  if (!usable) {
    clearRepairDraft(storage);
    return undefined;
  }
  return {
    personId,
    step,
    locationId: text(parsed.locationId),
    areaId: text(parsed.areaId),
    symptomKey: text(parsed.symptomKey),
    description: parsed.description as string,
    commandId: parsed.commandId as string,
    dismissed: (parsed.dismissed as unknown[]).filter((id): id is string => typeof id === 'string'),
  };
}

export function clearRepairDraft(storage: Storage): void {
  quietly(() => storage.removeItem(REPAIR_DRAFT_KEY), undefined);
}
