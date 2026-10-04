#!/usr/bin/env node
// @ts-check
/**
 * npm run deploy:dev — dev deploy wrapper (BUILD-COMMANDS, Part 6 §6.13, WEEK-0 P7-INFRA-01).
 *
 *   GM_DEV_PROJECT_ID=<approved dev project> npm run deploy:dev
 *
 * The target is validated against the administrator-approved infra/deploy/dev-targets.json
 * before any network call or child process. Until P7-INFRA-01 confirms the deploy method
 * there is no adapter, so this always stops with a clear reason. There is intentionally no
 * production deploy path here.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GuardError, parseDevTargetsConfig, resolveDevDeployTarget } from './lib/dev-deploy-guard.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = join(repoRoot, 'infra', 'deploy', 'dev-targets.json');
const FIREBASERC_PATH = join(repoRoot, '.firebaserc');

/**
 * Deploy adapters keyed by the name approved in dev-targets.json. Empty until P7-INFRA-01:
 * an adapter must call assertExplicitProject() for every CLI invocation it makes.
 * @type {Record<string, (target: { projectId: string }) => void>}
 */
const ADAPTERS = {};

/** @param {string} path */
function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new GuardError('CONFIG_INVALID', `Cannot read ${path.slice(repoRoot.length + 1)} as JSON.`);
  }
}

function main() {
  const config = parseDevTargetsConfig(readJson(CONFIG_PATH));
  const firebaserc = existsSync(FIREBASERC_PATH) ? readJson(FIREBASERC_PATH) : null;
  const target = resolveDevDeployTarget({ env: process.env, config, firebaserc });
  const adapter = ADAPTERS[target.adapter];
  if (adapter === undefined) {
    throw new GuardError('ADAPTER_NOT_IMPLEMENTED', `Deploy adapter "${target.adapter}" is not implemented in this repository.`);
  }
  adapter({ projectId: target.projectId });
}

try {
  main();
} catch (error) {
  if (!(error instanceof GuardError)) throw error;
  console.error(`deploy:dev blocked [${error.code}]: ${error.message}`);
  process.exitCode = 1;
}
