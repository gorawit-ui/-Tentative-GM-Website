// A11 — QR code IDs (Part 6 §6.2): printed on the wall, so they must not be guessable from the area,
// the time or each other — 128 random bits, base64url (22 characters).
import { describe, expect, it } from 'vitest';
import { isQrId } from '@gm/domain';
import { randomAreaId, randomQrId } from './ids';

describe('randomQrId', () => {
  const samples = Array.from({ length: 200 }, () => randomQrId());

  it('22 URL-safe characters, all different', () => {
    expect(samples.every(isQrId)).toBe(true);
    expect(new Set(samples).size).toBe(samples.length);
  });

  it('no shared prefix (a time- or counter-based ID would share its first characters)', () => {
    expect(new Set(samples.map((id) => id.slice(0, 4))).size).toBeGreaterThan(190);
  });

  it('every position varies (spread over the 64 characters; the 22nd holds the last 2 bits only)', () => {
    for (let position = 0; position < 21; position += 1) {
      expect(new Set(samples.map((id) => id[position])).size).toBeGreaterThan(30);
    }
  });
});

describe('randomAreaId', () => {
  it('12 hex characters, all different', () => {
    const ids = Array.from({ length: 100 }, () => randomAreaId());
    expect(ids.every((id) => /^[0-9a-f]{12}$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(100);
  });
});
