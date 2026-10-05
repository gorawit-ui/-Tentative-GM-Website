// S08 — readable request number (A4, Part 6 §6.6): `GM-` + at least 4 digits, one continuous
// sequence per environment, never reset, never reused, never wrapped (GM-10000 after GM-9999).
import { describe, expect, it } from 'vitest';
import { REQUEST_NUMBER_PREFIX, formatRequestNumber, nextRequestSequence } from './index';

describe('formatRequestNumber (A4)', () => {
  it.each([
    [1, 'GM-0001'],
    [2, 'GM-0002'],
    [427, 'GM-0427'],
    [9999, 'GM-9999'],
    [10000, 'GM-10000'],
    [10001, 'GM-10001'],
    [123456, 'GM-123456'],
  ])('sequence %i → %s', (sequence, expected) => {
    expect(formatRequestNumber(sequence)).toBe(expected);
  });

  it('uses the GM- prefix', () => {
    expect(REQUEST_NUMBER_PREFIX).toBe('GM-');
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects %s: numbers start at 1 and are whole',
    (sequence) => {
      expect(() => formatRequestNumber(sequence)).toThrow(RangeError);
    },
  );
});

describe('nextRequestSequence — counter `system_counters/request_sequence`', () => {
  it('a new environment starts at 1 (GM-0001)', () => {
    expect(nextRequestSequence(undefined)).toBe(1);
    expect(formatRequestNumber(nextRequestSequence(undefined))).toBe('GM-0001');
  });

  it('continues from the last issued number; a counter seeded at 0 also starts at 1', () => {
    expect(nextRequestSequence(0)).toBe(1);
    expect(nextRequestSequence(1)).toBe(2);
    expect(nextRequestSequence(426)).toBe(427);
  });

  it('after 9999 comes 10000, never a wrap back to 1', () => {
    expect(nextRequestSequence(9999)).toBe(10000);
    expect(formatRequestNumber(nextRequestSequence(9999))).toBe('GM-10000');
    expect(nextRequestSequence(10000)).toBe(10001);
  });

  it('depends only on the counter: a cancelled or deleted request never gives its number back', () => {
    // The counter is the only input; there is no “free list” of numbers to reuse.
    expect(nextRequestSequence.length).toBe(1);
    expect(nextRequestSequence(3)).toBe(4);
  });

  it.each([-1, 1.5, Number.NaN, '7', null, Number.MAX_SAFE_INTEGER])('a corrupt counter (%j) fails closed', (value) => {
    expect(() => nextRequestSequence(value as number)).toThrow(RangeError);
  });
});
