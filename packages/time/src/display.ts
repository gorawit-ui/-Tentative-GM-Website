/** Where a business duration is shown (Part 6 §6.7, F4, U4, P7-UX-01). */
export type DurationTextContext = 'waiting' | 'last_update' | 'gm_stale';

export function formatBusinessDuration(_rawDuration: number, _context: DurationTextContext): string {
  throw new Error('formatBusinessDuration: not implemented yet (S03)');
}
