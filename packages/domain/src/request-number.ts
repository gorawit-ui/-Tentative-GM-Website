// Readable request number (S08: A4, Part 6 §6.6). Pure: the API reads and writes the counter
// `system_counters/request_sequence` in the same transaction as the new request.

export const REQUEST_NUMBER_PREFIX = 'GM-';
const MIN_DIGITS = 4;

/** `GM-` + at least 4 digits: GM-0001, GM-0427, GM-9999, GM-10000 (never truncated or wrapped). */
export function formatRequestNumber(_sequence: number): string {
  void MIN_DIGITS;
  throw new Error('not implemented yet (S08)');
}

export function nextRequestSequence(_lastIssued: number | undefined): number {
  throw new Error('not implemented yet (S08)');
}
