// S10 — Rules read budget (Part 6 §6.5, [S05]): the only document a rule may read is
// access/{request.auth.uid}, at most once per check; request-level ACL comes from the fields of
// the document being read. No exists()/getAfter()/existsAfter() and no reads of other documents.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FIRESTORE_RULES_PATH } from './support/rules-env';

/** The rules source without comments (so a comment that mentions get() does not count). */
const source = readFileSync(FIRESTORE_RULES_PATH, 'utf8')
  .split('\n')
  .map((line) => line.replace(/\/\/.*$/, ''))
  .join('\n');

const ACCESS_GET = 'get(/databases/$(database)/documents/access/$(request.auth.uid))';

describe('infra/firestore.rules read budget', () => {
  it('reads exactly one document path: access/{request.auth.uid}', () => {
    // A document read is a bare get(...); `.get(key, default)` on a map is not a read.
    const reads = [...source.matchAll(/(?<![.\w])get\s*\(/g)].map((match) => source.slice(match.index, source.indexOf('\n', match.index)).trim());
    expect(reads).toHaveLength(1);
    expect(reads[0]).toContain(ACCESS_GET);
  });

  it('uses no exists(), getAfter() or existsAfter()', () => {
    expect(source).not.toMatch(/(?<![.\w])(exists|getAfter|existsAfter)\s*\(/);
  });

  it('every allow statement calls accessOf() at most once, and nothing else calls it', () => {
    const statements = [...source.matchAll(/\ballow\b[^;]*;/g)].map((match) => match[0]);
    expect(statements.length).toBeGreaterThan(0);
    for (const statement of statements) {
      expect((statement.match(/accessOf\(\)/g) ?? []).length, statement).toBeLessThanOrEqual(1);
    }
    const definition = /function\s+accessOf\s*\(\s*\)\s*\{[^}]*\}/.exec(source);
    expect(definition).not.toBeNull();
    const outside = source.replace(definition![0], '').replaceAll(/\ballow\b[^;]*;/g, '');
    expect(outside).not.toContain('accessOf()');
  });

  it('allows no client write anywhere', () => {
    const statements = [...source.matchAll(/\ballow\s+([\w\s,]+?)\s*:/g)].map((match) => match[1]!.split(',').map((operation) => operation.trim()));
    for (const operations of statements) {
      for (const operation of operations) expect(['read', 'get', 'list']).toContain(operation);
    }
  });

  it('has no wildcard that opens everything below it', () => {
    expect(source).not.toMatch(/match\s+\/\{[^}]*=\*\*\}\s*\{[^}]*allow\s+[^;]*:\s*if\s+true/);
    expect(source).not.toMatch(/:\s*if\s+true\s*;/);
  });
});
