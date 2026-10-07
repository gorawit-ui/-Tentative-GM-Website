// docs/spec/ACL-MATRIX.md must always match the ACL matrix fixture (regenerate with
// `npm run docs:acl-matrix`); and it must show only allowed cells, grouped by role.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACTIVE_SUBJECTS, RESOURCES, SUBJECTS, SUBJECT_KEYS, decide, resourcePattern } from './acl-matrix';
import { ACL_MATRIX_DOC_PATH, baselineRows, renderAclMatrixMarkdown } from './acl-matrix-doc';

const file = new URL(`../../../${ACL_MATRIX_DOC_PATH}`, import.meta.url);

describe('docs/spec/ACL-MATRIX.md', () => {
  it('exists and matches the fixture exactly (run `npm run docs:acl-matrix` after changing the fixture)', () => {
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe(renderAclMatrixMarkdown());
  });

  it('has a section for every role, and the two special sections', () => {
    const text = renderAclMatrixMarkdown();
    for (const key of SUBJECT_KEYS) expect(text).toContain(`### ${SUBJECTS[key].description} (\`${key}\`)`);
    expect(text).toContain('## งานลับ — ใครเห็นอะไรได้บ้าง');
    expect(text).toContain('## Watcher — เห็นอะไรได้บ้าง');
  });

  it('lists every allowed cell once — in the baseline or under its role — and nothing that is denied', () => {
    const text = renderAclMatrixMarkdown();
    const section = (heading: string) => {
      const start = text.indexOf(heading);
      const ends = [text.indexOf('\n### ', start + 1), text.indexOf('\n## ', start + 1)].filter((index) => index !== -1);
      return text.slice(start, Math.min(...ends, text.length));
    };
    const baseline = section('## สิทธิ์พื้นฐาน');
    const inBaseline = new Set(baselineRows().map((row) => row.resource.key));
    for (const resource of RESOURCES) {
      expect(baseline.includes(`| \`${resourcePattern(resource)}\` |`), resource.key).toBe(inBaseline.has(resource.key));
    }
    for (const key of SUBJECT_KEYS) {
      const own = section(`### ${SUBJECTS[key].description}`);
      const active = (ACTIVE_SUBJECTS as readonly string[]).includes(key);
      for (const resource of RESOURCES) {
        const anyAllowed = (['get', 'list', 'create', 'update', 'delete'] as const).some(
          (operation) => decide(key, resource.key, operation) === 'allow',
        );
        const listed = own.includes(`| \`${resourcePattern(resource)}\` |`);
        const covered = listed || (active && inBaseline.has(resource.key));
        expect(covered, `${key} ${resource.key}`).toBe(anyAllowed);
        if (!anyAllowed) expect(listed, `${key} ${resource.key} denied but listed`).toBe(false);
      }
    }
  });

  it('the baseline really is identical for every active account', () => {
    for (const row of baselineRows()) {
      for (const key of ACTIVE_SUBJECTS) {
        for (const operation of row.reads) expect(decide(key, row.resource.key, operation)).toBe('allow');
      }
    }
  });

  it('every resource has its own readable path pattern', () => {
    const patterns = RESOURCES.map(resourcePattern);
    expect(new Set(patterns).size).toBe(patterns.length);
  });
});
