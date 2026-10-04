// @ts-check
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GuardError, assertExplicitProject, parseDevTargetsConfig, resolveDevDeployTarget } from './dev-deploy-guard.mjs';

/** A config as it would look after the infrastructure owner approves a dev target (fixture only). */
const APPROVED = Object.freeze({
  status: 'approved',
  approvedBy: 'fixture-infra-owner',
  approvedAt: '2026-10-04',
  adapter: 'fixture-adapter',
  allowedDevProjectIds: ['gm-fixture-dev-1'],
  deniedProjectIds: ['tdfb-gm-prod'],
});
const committedConfig = parseDevTargetsConfig(
  JSON.parse(readFileSync(new URL('../../infra/deploy/dev-targets.json', import.meta.url), 'utf8')),
);

/**
 * @param {() => unknown} action
 * @returns {string} the GuardError code thrown by action
 */
function guardCode(action) {
  try {
    action();
  } catch (error) {
    if (error instanceof GuardError) return error.code;
    throw error;
  }
  throw new Error('expected a GuardError');
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {{ config?: import('./dev-deploy-guard.mjs').DevTargetsConfig, firebaserc?: unknown }} [options]
 */
function resolve(env, options = {}) {
  return resolveDevDeployTarget({ env, config: options.config ?? APPROVED, firebaserc: options.firebaserc ?? null });
}

describe('resolveDevDeployTarget — refuses before any network call', () => {
  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['whitespace', '   '],
  ])('empty target (%s) → TARGET_EMPTY', (_label, value) => {
    expect(guardCode(() => resolve({ GM_DEV_PROJECT_ID: value }))).toBe('TARGET_EMPTY');
  });

  it.each([' gm-fixture-dev-1', 'GM-FIXTURE-DEV', 'gm_fixture_dev', '--project=gm-fixture-dev-1', 'a'])(
    'malformed target %j → TARGET_INVALID',
    (value) => {
      expect(guardCode(() => resolve({ GM_DEV_PROJECT_ID: value }))).toBe('TARGET_INVALID');
    },
  );

  it.each(['tdfb-gm-prod', 'gm-production-1', 'prod-gm-tools'])('production target %s → TARGET_PROD', (value) => {
    expect(guardCode(() => resolve({ GM_DEV_PROJECT_ID: value }))).toBe('TARGET_PROD');
  });

  it.each(['tdfb-gm-dev', 'another-team-dev'])('unknown target %s is refused despite the -dev suffix', (value) => {
    expect(guardCode(() => resolve({ GM_DEV_PROJECT_ID: value }))).toBe('TARGET_NOT_APPROVED');
  });

  it('refuses an ambient project selector that points elsewhere', () => {
    const env = { GM_DEV_PROJECT_ID: 'gm-fixture-dev-1', CLOUDSDK_CORE_PROJECT: 'tdfb-gm-prod' };
    expect(guardCode(() => resolve(env))).toBe('AMBIENT_PROJECT_MISMATCH');
  });

  it('refuses credential overrides and never echoes their values', () => {
    const env = { GM_DEV_PROJECT_ID: 'gm-fixture-dev-1', GOOGLE_APPLICATION_CREDENTIALS: '/secret/path/key.json' };
    expect(guardCode(() => resolve(env))).toBe('CREDENTIAL_OVERRIDE_SET');
    expect(() => resolve(env)).toThrow(/GOOGLE_APPLICATION_CREDENTIALS/);
    expect(() => resolve(env)).not.toThrow(/secret\/path/);
  });

  it('refuses when .firebaserc defines a default project', () => {
    const firebaserc = { projects: { default: 'gm-fixture-dev-1' } };
    expect(guardCode(() => resolve({ GM_DEV_PROJECT_ID: 'gm-fixture-dev-1' }, { firebaserc }))).toBe(
      'DEFAULT_PROJECT_CONFIGURED',
    );
  });

  it('refuses an approved target while no deploy adapter is approved (P7-INFRA-01)', () => {
    const config = { ...APPROVED, adapter: null };
    expect(guardCode(() => resolve({ GM_DEV_PROJECT_ID: 'gm-fixture-dev-1' }, { config }))).toBe('ADAPTER_MISSING');
  });

  it('accepts only an approved target with a clean environment', () => {
    const env = { GM_DEV_PROJECT_ID: 'gm-fixture-dev-1', GOOGLE_CLOUD_PROJECT: 'gm-fixture-dev-1' };
    expect(resolve(env)).toEqual({ projectId: 'gm-fixture-dev-1', adapter: 'fixture-adapter' });
  });

  it.each([undefined, '', 'tdfb-gm-prod', 'tdfb-gm-dev', 'gm-fixture-dev-1'])(
    'the committed config fails closed for %j',
    (value) => {
      expect(() => resolve({ GM_DEV_PROJECT_ID: value }, { config: committedConfig })).toThrow(GuardError);
    },
  );
});

describe('parseDevTargetsConfig — strict, fails closed', () => {
  it('accepts the committed config, which approves nothing yet', () => {
    expect(committedConfig.allowedDevProjectIds).toEqual([]);
    expect(committedConfig.adapter).toBeNull();
  });

  it.each([
    ['not an object', []],
    ['unknown key (typo)', { ...APPROVED, allowedDevProjectIDs: [] }],
    ['allowlist without approval', { ...APPROVED, approvedBy: null }],
    ['production-like id allowed', { ...APPROVED, allowedDevProjectIds: ['gm-prod-1'] }],
    ['id both allowed and denied', { ...APPROVED, deniedProjectIds: ['gm-fixture-dev-1'] }],
    ['malformed id', { ...APPROVED, allowedDevProjectIds: ['Bad ID'] }],
    ['empty adapter name', { ...APPROVED, adapter: '' }],
  ])('%s → CONFIG_INVALID', (_label, raw) => {
    expect(guardCode(() => parseDevTargetsConfig(raw))).toBe('CONFIG_INVALID');
  });
});

describe('assertExplicitProject — every CLI call names the project', () => {
  it.each([
    [['deploy', '--project', 'gm-fixture-dev-1']],
    [['deploy', '--project=gm-fixture-dev-1']],
    [['deploy', '-P', 'gm-fixture-dev-1']],
  ])('accepts %j', (args) => {
    expect(() => assertExplicitProject(args, 'gm-fixture-dev-1')).not.toThrow();
  });

  it('rejects a call without --project (would use a default project)', () => {
    expect(guardCode(() => assertExplicitProject(['deploy'], 'gm-fixture-dev-1'))).toBe('PROJECT_FLAG_MISSING');
  });

  it('rejects --project given twice', () => {
    const args = ['deploy', '--project', 'gm-fixture-dev-1', '--project=tdfb-gm-prod'];
    expect(guardCode(() => assertExplicitProject(args, 'gm-fixture-dev-1'))).toBe('PROJECT_FLAG_MISSING');
  });

  it('rejects a different project', () => {
    expect(guardCode(() => assertExplicitProject(['deploy', '--project', 'tdfb-gm-prod'], 'gm-fixture-dev-1'))).toBe(
      'PROJECT_FLAG_MISMATCH',
    );
  });
});

describe('guard module stays pure', () => {
  it.each(['./dev-deploy-guard.mjs', './env-safety.mjs'])('%s imports no network, process or file-system module', (file) => {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    const imports = [...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]/g)].map(
      (match) => match[1] ?? match[2],
    );
    expect(imports.every((specifier) => specifier === './env-safety.mjs')).toBe(true);
  });
});
