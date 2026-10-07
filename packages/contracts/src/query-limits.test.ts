// D-S10-4 — every client list query is bounded: Rules refuse a list without a limit or above 200
// (budget, Part 6 §6.11); “ดูทั้งหมด” pages by 50.
import { describe, expect, it } from 'vitest';
import { ARCHIVE_PAGE_SIZE, MAX_LIST_LIMIT, pageLimit } from './index';

describe('query limits (D-S10-4)', () => {
  it('a list query may ask for at most 200 documents; the archive pages by 50', () => {
    expect(MAX_LIST_LIMIT).toBe(200);
    expect(ARCHIVE_PAGE_SIZE).toBe(50);
    expect(ARCHIVE_PAGE_SIZE).toBeLessThanOrEqual(MAX_LIST_LIMIT);
  });

  it('pageLimit keeps a requested size inside 1..200 and defaults to the archive page', () => {
    expect(pageLimit()).toBe(50);
    expect(pageLimit(25)).toBe(25);
    expect(pageLimit(500)).toBe(200);
    expect(pageLimit(0)).toBe(1);
    expect(pageLimit(12.7)).toBe(12);
    expect(() => pageLimit(Number.NaN)).toThrow(RangeError);
  });
});
