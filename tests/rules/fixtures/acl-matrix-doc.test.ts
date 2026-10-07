// docs/spec/ACL-MATRIX.md must always match the ACL matrix fixture (regenerate with
// `npm run docs:acl-matrix`); and it must show only allowed cells, grouped by role.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RESOURCES, SUBJECTS, SUBJECT_KEYS, decide, resourcePattern } from './acl-matrix';
import { ACL_MATRIX_DOC_PATH, renderAclMatrixMarkdown } from './acl-matrix-doc';

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

  it('lists every allowed cell under its role, and nothing that is denied', () => {
    const text = renderAclMatrixMarkdown();
    const roleText = (key: (typeof SUBJECT_KEYS)[number]) => {
      const start = text.indexOf(`### ${SUBJECTS[key].description}`);
      const next = text.indexOf('\n### ', start + 1);
      const end = next === -1 ? text.indexOf('\n## ', start + 1) : Math.min(next, text.indexOf('\n## ', start + 1) === -1 ? next : text.indexOf('\n## ', start + 1));
      return text.slice(start, end);
    };
    for (const key of SUBJECT_KEYS) {
      const section = roleText(key);
      for (const resource of RESOURCES) {
        const listed = section.includes(`| \`${resourcePattern(resource)}\` |`);
        const anyAllowed = ['get', 'list', 'create', 'update', 'delete'].some(
          (operation) => decide(key, resource.key, operation as 'get') === 'allow',
        );
        expect(listed, `${key} ${resource.key}`).toBe(anyAllowed);
      }
    }
  });

  it('every resource has its own readable path pattern', () => {
    const patterns = RESOURCES.map(resourcePattern);
    expect(new Set(patterns).size).toBe(patterns.length);
  });
});
