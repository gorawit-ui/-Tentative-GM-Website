// S10 — Rules read budget (Part 6 §6.5, [S05]): the only document a rule may read is
// access/{request.auth.uid}, at most once per check; request-level ACL comes from the fields of
// the document being read. No exists()/getAfter()/existsAfter() and no reads of other documents.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAX_LIST_LIMIT } from '@gm/contracts';
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

describe('D-S10-4: list queries are bounded in the Rules', () => {
  it('get and list are separate statements (no `allow read`), so every list can carry the bound', () => {
    expect(source).not.toMatch(/\ballow\s+read\b/);
  });

  it('every allow list checks boundedList(), and boundedList() caps the limit at MAX_LIST_LIMIT', () => {
    const lists = [...source.matchAll(/\ballow\s+list\b[^;]*;/g)].map((match) => match[0]);
    expect(lists.length).toBeGreaterThan(0);
    for (const statement of lists) expect(statement, statement).toContain('boundedList()');
    const definition = /function\s+boundedList\s*\(\s*\)\s*\{([^}]*)\}/.exec(source);
    expect(definition?.[1]).toContain(`request.query.limit <= ${MAX_LIST_LIMIT}`);
    expect(definition?.[1]).toContain('request.query.limit is int');
  });
});

describe('D-S10-5: the e-mail domain is compared after lower()', () => {
  it('corporateSignIn() lower-cases the e-mail before the exact @tdfb.co match', () => {
    expect(source).toContain("request.auth.token.email.lower().matches('^[a-z0-9._%+-]+@tdfb[.]co$')");
  });
});

