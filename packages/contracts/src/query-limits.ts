// D-S10-4 — bounds for every client list query (Part 6 §6.11, budget). Firestore Rules refuse a
// list without a limit or above MAX_LIST_LIMIT; the “ดูทั้งหมด” archive pages by ARCHIVE_PAGE_SIZE.
export const MAX_LIST_LIMIT = 200;
export const ARCHIVE_PAGE_SIZE = 50;

/** A page size for a client list query: whole number within 1..MAX_LIST_LIMIT, default ARCHIVE_PAGE_SIZE. */
export function pageLimit(requested: number = ARCHIVE_PAGE_SIZE): number {
  if (Number.isNaN(requested)) throw new RangeError('page size must be a number');
  return Math.min(MAX_LIST_LIMIT, Math.max(1, Math.floor(requested)));
}
