// Readable request number (S08: A4, Part 6 §6.6; prefix per environment D-S08-8). Pure: the API reads and writes the counter
// `system_counters/request_sequence` in the same transaction as the new request.

/** D-S08-8: where the system runs (`local` = emulator on a developer machine). */
export type DeploymentEnvironment = 'prod' | 'dev' | 'local';

export const REQUEST_NUMBER_PREFIXES: Readonly<Record<DeploymentEnvironment, string>> = { prod: 'GM-', dev: 'DEV-', local: 'DEV-' };

/** The prefix for an environment; anything else fails closed instead of guessing `GM-`. */
export function requestNumberPrefix(environment: DeploymentEnvironment): string {
  if (!Object.hasOwn(REQUEST_NUMBER_PREFIXES, environment)) {
    throw new RangeError(`unknown deployment environment ${JSON.stringify(environment)}`);
  }
  return REQUEST_NUMBER_PREFIXES[environment];
}
const MIN_DIGITS = 4;

function requireSequence(value: unknown, what: string, minimum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(`${what} must be a whole number of at least ${minimum}`);
  }
  return value;
}

/**
 * Prefix + at least 4 digits: GM-0001, GM-0427, GM-9999, GM-10000 in prod; DEV-0001 in dev/local
 * (D-S08-8). Never truncated or wrapped.
 */
export function formatRequestNumber(sequence: number, environment: DeploymentEnvironment): string {
  const digits = String(requireSequence(sequence, 'request sequence', 1)).padStart(MIN_DIGITS, '0');
  return `${requestNumberPrefix(environment)}${digits}`;
}

/**
 * Next sequence from the last issued one (`undefined` = new environment → 1). The counter is the
 * only input, so a cancelled or deleted request never gives its number back; a corrupt counter
 * fails closed instead of guessing.
 */
export function nextRequestSequence(lastIssued: number | undefined): number {
  if (lastIssued === undefined) return 1;
  const next = requireSequence(lastIssued, 'request counter', 0) + 1;
  return requireSequence(next, 'next request sequence', 1);
}
