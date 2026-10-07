// D-S10-4 — bounds for every client list query (Part 6 §6.11, budget). Firestore Rules refuse a
// list without a limit or above MAX_LIST_LIMIT; the “ดูทั้งหมด” archive pages by ARCHIVE_PAGE_SIZE.
export const MAX_LIST_LIMIT = 200;
export const ARCHIVE_PAGE_SIZE = 50;

export function pageLimit(_requested?: number): number {
  throw new Error('NOT_IMPLEMENTED');
}
