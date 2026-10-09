#!/usr/bin/env node
// @ts-check
/**
 * npm run check:deps — static lockfile check, first step of `npm run verify`.
 * BUILD-COMMANDS `npm ci`: reproducible install, no paid dependency. Verifies that every
 * locked package comes from the public npm registry with an integrity hash and carries a
 * free open-source license. A new license or source fails the check until a person reviews it.
 */
import { readFileSync } from 'node:fs';

const REGISTRY = 'https://registry.npmjs.org/';
const ALLOWED_LICENSES = new Set([
  '0BSD',
  'Apache-2.0',
  'BlueOak-1.0.0',
  'BSD',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC0-1.0',
  'ISC',
  'MIT',
  'MPL-2.0',
  // SIL Open Font License: free font files (A09: IBM Plex Sans Thai Looped, Part 3 §0.1 / Part 4 font).
  'OFL-1.1',
  'Python-2.0',
  'public domain',
]);
/** Packages whose lockfile entry has no SPDX license field; verified by reading their LICENSE file. */
const VERIFIED_WITHOUT_LICENSE_FIELD = new Map([
  ['fuzzy@0.1.3', 'MIT (package.json "licenses" array, LICENSE-MIT)'],
  ['valid-url@1.0.9', 'MIT (LICENSE)'],
  ['limiter@1.1.5', 'MIT (package.json "licenses" array, LICENSE.txt) — via firebase-admin > jwks-rsa (S12)'],
]);

/**
 * @param {string} expression SPDX-like license expression
 * @returns {boolean}
 */
function isAllowedLicense(expression) {
  const inner = expression.replace(/^\((.*)\)$/, '$1');
  if (inner.includes(' OR ')) return inner.split(' OR ').some((part) => isAllowedLicense(part.trim()));
  if (inner.includes(' AND ')) return inner.split(' AND ').every((part) => isAllowedLicense(part.trim()));
  return ALLOWED_LICENSES.has(inner);
}

const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
/** @type {string[]} */
const problems = [];
if (lock.lockfileVersion !== 3) problems.push(`lockfileVersion must be 3, found ${lock.lockfileVersion}`);

/** @type {Map<string, number>} */
const licenseCounts = new Map();
let packageCount = 0;
for (const [path, entry] of Object.entries(/** @type {Record<string, any>} */ (lock.packages))) {
  if (!path.includes('node_modules/') || entry.link) continue;
  packageCount += 1;
  const id = `${path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length)}@${entry.version}`;

  if (entry.extraneous) problems.push(`${id}: extraneous entry (run npm install once more and commit the lockfile)`);
  if (typeof entry.resolved !== 'string' || !entry.resolved.startsWith(REGISTRY)) {
    problems.push(`${id}: not resolved from ${REGISTRY}`);
  }
  if (typeof entry.integrity !== 'string' || !entry.integrity.startsWith('sha512-')) {
    problems.push(`${id}: missing sha512 integrity`);
  }

  const license = typeof entry.license === 'string' ? entry.license : undefined;
  if (license === undefined) {
    if (!VERIFIED_WITHOUT_LICENSE_FIELD.has(id)) problems.push(`${id}: no license field; review it before use`);
  } else if (!isAllowedLicense(license)) {
    problems.push(`${id}: license "${license}" is not on the free/open-source allowlist; review it`);
  }
  const label = license ?? 'verified without field';
  licenseCounts.set(label, (licenseCounts.get(label) ?? 0) + 1);
}

if (problems.length > 0) {
  console.error(`check:deps FAILED (${problems.length} problem(s)):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
const summary = [...licenseCounts].sort((a, b) => b[1] - a[1]).map(([name, count]) => `${name} ${count}`);
console.info(`check:deps OK: ${packageCount} locked packages, all from ${REGISTRY} with sha512 integrity.`);
console.info(`licenses: ${summary.join(', ')}`);
