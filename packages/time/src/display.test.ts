// S03 — display text for business durations (Part 6 §6.7, F4, U4, P7-UX-01).
// Display floors to whole business days; decisions elsewhere keep the raw value.
import { describe, expect, it } from 'vitest';
import { BUSINESS_DAY_MS, formatBusinessDuration } from './index';

const BD = BUSINESS_DAY_MS;

describe('P7-UX-01: less than 1 business day is never shown as "0 วันทำการ"', () => {
  it.each([0, 1, 0.4 * BD, BD - 1])('waiting %s ms → "ไม่ถึง 1 วันทำการ"', (raw) => {
    const text = formatBusinessDuration(raw, 'waiting');
    expect(text).toBe('ไม่ถึง 1 วันทำการ');
    expect(text).not.toContain('0 วันทำการ');
  });

  it.each([0, 0.4 * BD, BD - 1])('last update %s ms keeps "ที่แล้ว"', (raw) => {
    const text = formatBusinessDuration(raw, 'last_update');
    expect(text).toBe('อัปเดตล่าสุดไม่ถึง 1 วันทำการที่แล้ว');
    expect(text).not.toContain('0 วันทำการ');
  });
});

describe('whole business days, floored (F4)', () => {
  it.each([
    [BD, '1 วันทำการ'],
    [4.1 * BD, '4 วันทำการ'],
    [4.9 * BD, '4 วันทำการ'],
    [5 * BD, '5 วันทำการ'],
  ])('waiting %s ms → %s', (raw, expected) => {
    expect(formatBusinessDuration(raw, 'waiting')).toBe(expected);
  });

  it('last update: 4.9 business days → "อัปเดตล่าสุด 4 วันทำการที่แล้ว"', () => {
    expect(formatBusinessDuration(4.9 * BD, 'last_update')).toBe('อัปเดตล่าสุด 4 วันทำการที่แล้ว');
  });

  it('the raw value passed in is not changed by formatting', () => {
    const raw = 4.9 * BD;
    formatBusinessDuration(raw, 'waiting');
    expect(raw).toBe(4.9 * BD);
  });
});

describe('GM stale label (F4, U4)', () => {
  it('3 business days + 1 ms → "ไม่ขยับ 3 วันทำการ · ถึงเวลาติดตาม"', () => {
    expect(formatBusinessDuration(3 * BD + 1, 'gm_stale')).toBe('ไม่ขยับ 3 วันทำการ · ถึงเวลาติดตาม');
  });

  it('4.9 business days → "ไม่ขยับ 4 วันทำการ · ถึงเวลาติดตาม"', () => {
    expect(formatBusinessDuration(4.9 * BD, 'gm_stale')).toBe('ไม่ขยับ 4 วันทำการ · ถึงเวลาติดตาม');
  });

  it('is refused for a duration that is not stale (exactly 3 business days)', () => {
    expect(() => formatBusinessDuration(3 * BD, 'gm_stale')).toThrow(RangeError);
  });
});

describe('invalid input', () => {
  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('rejects raw duration %s', (raw) => {
    expect(() => formatBusinessDuration(raw, 'waiting')).toThrow(RangeError);
  });

  it('rejects an unknown context', () => {
    expect(() => formatBusinessDuration(BD, 'today' as never)).toThrow(RangeError);
  });
});
