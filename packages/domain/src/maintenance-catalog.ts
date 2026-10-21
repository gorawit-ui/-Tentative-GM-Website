// A12 — the symptoms of the repair form (PRD US-03 “หมวดอาการตั้งต้น”, UI-03 step 3), in the brief's order
// with “อื่นๆ” last. The key is what a request stores (`symptom_key`, compared by the duplicate check of
// A13); the label is what the automatic title (U2) and the board show. Places and areas are the Admin's
// data (A11), not code.
import { maintenanceTitle } from './request-creation';

export interface MaintenanceSymptom {
  readonly key: string;
  readonly label: string;
}

export const OTHER_SYMPTOM_KEY = 'other';

export const MAINTENANCE_SYMPTOMS: readonly MaintenanceSymptom[] = [
  { key: 'aircon', label: 'แอร์' },
  { key: 'light_bulb', label: 'หลอดไฟ' },
  { key: 'power_outage', label: 'ไฟดับ' },
  { key: 'internet', label: 'อินเทอร์เน็ต' },
  { key: 'restroom', label: 'ห้องน้ำ' },
  { key: 'sink', label: 'ซิงค์' },
  { key: 'elevator', label: 'ลิฟท์' },
  { key: 'cctv', label: 'กล้องวงจรปิด' },
  { key: 'air_purifier', label: 'เครื่องฟอกอากาศ' },
  { key: 'printer', label: 'เครื่องปริ้นท์' },
  { key: 'desk', label: 'โต๊ะ/โต๊ะแพ็ค' },
  { key: 'shelf', label: 'Shelf' },
  { key: 'electrical_panel', label: 'ตู้ไฟ' },
  { key: OTHER_SYMPTOM_KEY, label: 'อื่นๆ' },
];

export function maintenanceSymptom(key: string): MaintenanceSymptom | undefined {
  return MAINTENANCE_SYMPTOMS.find((symptom) => symptom.key === key);
}

/** U2: the title the request will get, shown before the details step; nothing until place and symptom are chosen. */
export function repairTitlePreview(parts: { readonly symptomLabel: string; readonly areaLabel?: string | undefined; readonly locationLabel: string }): string | undefined {
  if (parts.symptomLabel.trim() === '' || parts.locationLabel.trim() === '') return undefined;
  return maintenanceTitle(parts);
}
