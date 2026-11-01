// A12 — the symptoms of the repair form (PRD US-03 “หมวดอาการตั้งต้น”, UI-03 step 3): the brief's list in
// its order, “อื่นๆ” last; keys are stable IDs stored on requests (`symptom_key`), labels are what the
// title (U2) and the board show. The places come from the Admin's locations/areas (A11), not from code.
import { describe, expect, it } from 'vitest';
import { MAINTENANCE_SYMPTOMS, OTHER_SYMPTOM_KEY, maintenanceSymptom, repairTitlePreview } from './index';

describe('MAINTENANCE_SYMPTOMS', () => {
  it('the brief’s symptoms in order, “อื่นๆ” last', () => {
    expect(MAINTENANCE_SYMPTOMS.map((symptom) => symptom.label)).toEqual([
      'แอร์',
      'หลอดไฟ',
      'ไฟดับ',
      'อินเทอร์เน็ต',
      'ห้องน้ำ',
      'ซิงค์',
      'ลิฟท์',
      'กล้องวงจรปิด',
      'เครื่องฟอกอากาศ',
      'เครื่องปริ้นท์',
      'โต๊ะ/โต๊ะแพ็ค',
      'Shelf',
      'ตู้ไฟ',
      'อื่นๆ',
    ]);
    expect(MAINTENANCE_SYMPTOMS.at(-1)?.key).toBe(OTHER_SYMPTOM_KEY);
  });

  it('keys are unique, stable IDs (letters, digits, _)', () => {
    const keys = MAINTENANCE_SYMPTOMS.map((symptom) => symptom.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(/^[a-z][a-z0-9_]{1,40}$/);
  });

  it('lookup by key; an unknown key is not a symptom', () => {
    expect(maintenanceSymptom('aircon')).toEqual({ key: 'aircon', label: 'แอร์' });
    expect(maintenanceSymptom(OTHER_SYMPTOM_KEY)).toEqual({ key: 'other', label: 'อื่นๆ' });
    expect(maintenanceSymptom('ice_machine')).toBeUndefined();
    expect(maintenanceSymptom('toString')).toBeUndefined();
  });
});

describe('repairTitlePreview (U2, shown before the details step)', () => {
  it('with an area, without one, and “อื่นๆ”', () => {
    expect(repairTitlePreview({ symptomLabel: 'แอร์', areaLabel: 'ห้องแพ็คชั้น 1', locationLabel: 'WH300' })).toBe('แอร์ — ห้องแพ็คชั้น 1 · WH300');
    expect(repairTitlePreview({ symptomLabel: 'แอร์', locationLabel: 'FAC16' })).toBe('แอร์ · FAC16');
    expect(repairTitlePreview({ symptomLabel: 'อื่นๆ', locationLabel: 'Office 195' })).toBe('อื่นๆ · Office 195');
  });

  it('nothing to preview until the place and the symptom are chosen', () => {
    expect(repairTitlePreview({ symptomLabel: '', locationLabel: 'WH300' })).toBeUndefined();
    expect(repairTitlePreview({ symptomLabel: 'แอร์', locationLabel: '' })).toBeUndefined();
  });
});
