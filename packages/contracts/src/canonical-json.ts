/**
 * Canonical JSON (S08): object keys sorted at every depth, arrays in order, strings exactly as
 * given, no whitespace. The command fingerprint hashes this (Part 6 §6.6). Values JSON cannot
 * carry exactly (undefined, functions, NaN/Infinity) are refused rather than dropped.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonical(value));
}

function canonical(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('canonical JSON has no NaN or Infinity');
    return value;
  }
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === 'object') {
    const entries = Object.keys(value)
      .sort()
      .map((key) => [key, canonical((value as Record<string, unknown>)[key])] as const);
    return Object.fromEntries(entries);
  }
  throw new TypeError(`canonical JSON cannot carry ${typeof value}`);
}
