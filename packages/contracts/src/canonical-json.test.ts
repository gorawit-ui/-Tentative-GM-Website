// S08 — canonical JSON of a command, so the same command always gives the same fingerprint
// (Part 6 §6.6 “Idempotency-Key + actor + payload hash”).
import { describe, expect, it } from 'vitest';
import { canonicalJson } from './index';

describe('canonicalJson', () => {
  it('sorts object keys at every depth; arrays keep their order', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, 1], c: 'ก' } })).toBe('{"a":{"c":"ก","d":[3,1]},"b":1}');
    expect(canonicalJson({ a: { c: 'ก', d: [3, 1] }, b: 1 })).toBe(canonicalJson({ b: 1, a: { d: [3, 1], c: 'ก' } }));
  });

  it('keeps strings exactly (no trimming or normalising)', () => {
    expect(canonicalJson({ t: ' แอร์ ' })).not.toBe(canonicalJson({ t: 'แอร์' }));
  });

  it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY, () => 1, { a: undefined }, [undefined]])(
    'refuses values JSON cannot carry exactly (%s)',
    (value) => {
      expect(() => canonicalJson(value)).toThrow(TypeError);
    },
  );
});
