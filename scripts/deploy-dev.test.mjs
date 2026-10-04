// @ts-check
// Runs the real `deploy:dev` entry point under a preload that refuses and records every
// network attempt and child process, proving the guard fails before any network call.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const preload = new URL('../tests/support/no-network-preload.mjs', import.meta.url).href;
const deployScript = fileURLToPath(new URL('./deploy-dev.mjs', import.meta.url));
const workDir = mkdtempSync(join(tmpdir(), 'gm-deploy-dev-test-'));
afterAll(() => rmSync(workDir, { recursive: true, force: true }));

let runCount = 0;

/**
 * @param {string[]} nodeArgs arguments after the preload
 * @param {Record<string, string>} extraEnv
 */
function runWithPreload(nodeArgs, extraEnv = {}) {
  const reportPath = join(workDir, `report-${(runCount += 1)}.json`);
  const result = spawnSync(process.execPath, ['--import', preload, ...nodeArgs], {
    cwd: repoRoot,
    // Minimal environment: nothing inherited that could select a project or credential.
    env: { PATH: process.env.PATH ?? '', GM_NO_NETWORK_REPORT: reportPath, ...extraEnv },
    encoding: 'utf8',
    timeout: 20_000,
  });
  const report = existsSync(reportPath)
    ? /** @type {{ attempts: string[] }} */ (JSON.parse(readFileSync(reportPath, 'utf8')))
    : undefined;
  return { status: result.status, stderr: result.stderr, report };
}

describe('npm run deploy:dev — fails closed before any network call', () => {
  it.each([
    { label: 'empty: GM_DEV_PROJECT_ID unset', env: {}, code: 'TARGET_EMPTY' },
    { label: 'empty: GM_DEV_PROJECT_ID=""', env: { GM_DEV_PROJECT_ID: '' }, code: 'TARGET_EMPTY' },
    { label: 'prod target', env: { GM_DEV_PROJECT_ID: 'tdfb-gm-prod' }, code: 'TARGET_PROD' },
    {
      label: 'unknown target (proposed dev ID, not approved)',
      env: { GM_DEV_PROJECT_ID: 'tdfb-gm-dev' },
      code: 'TARGET_NOT_APPROVED',
    },
    { label: 'unknown target with -dev suffix', env: { GM_DEV_PROJECT_ID: 'another-team-dev' }, code: 'TARGET_NOT_APPROVED' },
    { label: 'malformed target', env: { GM_DEV_PROJECT_ID: 'Not A Project' }, code: 'TARGET_INVALID' },
  ])('$label → exit 1 [$code], zero network attempts, zero child processes', ({ env, code }) => {
    const run = runWithPreload([deployScript], /** @type {Record<string, string>} */ (env));
    expect(run.status).toBe(1);
    expect(run.stderr).toContain(`deploy:dev blocked [${code}]`);
    expect(run.report).toEqual({ attempts: [] });
  });
});

describe('no-network preload — detector self-check', () => {
  it('records a network attempt', () => {
    const run = runWithPreload(['--input-type=module', '-e', "await fetch('https://example.invalid/').catch(() => {});"]);
    expect(run.report?.attempts).toEqual(['fetch https://example.invalid/']);
  });

  it('records a child process attempt', () => {
    const run = runWithPreload(['-e', "try { require('node:child_process').spawnSync('git', ['--version']); } catch {}"]);
    expect(run.report?.attempts).toEqual(['child_process.spawnSync git']);
  });
});
