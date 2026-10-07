// docs/spec/ACL-MATRIX.md must always match the ACL matrix fixture (regenerate with
// `npm run docs:acl-matrix`); and it must show only allowed cells, grouped by role.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACTIVE_SUBJECTS, RESOURCES, SUBJECTS, SUBJECT_KEYS, decide, resourcePattern } from './acl-matrix';
import { ACL_MATRIX_DOC_PATH, baselineRows, renderAclMatrixMarkdown } from './acl-matrix-doc';
import { API_ENDPOINTS, apiDecide } from './api-matrix';
import { SCREEN_SOURCES, STORAGE_SAMPLE_PATHS } from './screen-sources';

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
    expect(text).toContain('## Storage');
    expect(text).toContain('## หน้าจอ → แหล่งข้อมูล');
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

  it('D-ACL-5: has a Storage section saying no client reads or writes Storage, and how files are served', () => {
    const text = renderAclMatrixMarkdown();
    const storage = text.slice(text.indexOf('## Storage'), text.indexOf('## หน้าจอ → แหล่งข้อมูล'));
    expect(storage).toContain('ไม่ได้ทุก role');
    expect(storage).toContain('signed URL แบบ GET เฉพาะ object นั้น อายุสั้น 5 นาที');
    for (const path of STORAGE_SAMPLE_PATHS) expect(storage).toContain(`\`${path}\``);
  });

  it('D-ACL-6: has a screen → data source row for every screen, with its open questions', () => {
    const text = renderAclMatrixMarkdown();
    const screens = text.slice(text.indexOf('## หน้าจอ → แหล่งข้อมูล'));
    for (const entry of SCREEN_SOURCES) {
      const row = screens.split('\n').find((line) => line.startsWith(`| ${entry.screen} |`));
      expect(row, entry.screen).toBeDefined();
      for (const question of entry.questions) expect(row).toContain(question.slice(0, 7));
    }
  });

  it('S12: has the API section with one row per endpoint listing exactly the allowed roles', () => {
    const text = renderAclMatrixMarkdown();
    const api = text.slice(text.indexOf('## API (Admin SDK)'), text.indexOf('## หน้าจอ → แหล่งข้อมูล'));
    for (const endpoint of API_ENDPOINTS) {
      const row = api.split('\n').find((line) => line.startsWith(`| \`${endpoint.key}\` |`));
      expect(row, endpoint.key).toBeDefined();
      for (const key of SUBJECT_KEYS) expect(row!.split(' | ')[1]!.includes(`\`${key}\``), `${endpoint.key} ${key}`).toBe(apiDecide(key, endpoint.key) === 'allow');
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
