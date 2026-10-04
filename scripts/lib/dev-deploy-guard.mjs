// @ts-check
/**
 * Target validation for `npm run deploy:dev` (BUILD-COMMANDS, Part 6 §6.13, WEEK-0 P7-INFRA-01).
 *
 * Pure: no file system, network or child processes. The caller passes the environment,
 * the administrator-approved config and the parsed .firebaserc, so every check here runs
 * before any network call can happen. Error messages name variables, never their values.
 */
import { AMBIENT_PROJECT_ENV_VARS, CREDENTIAL_ENV_VARS, setVariableNames } from './env-safety.mjs';

/** Google Cloud project ID format: 6–30 chars, lowercase letters, digits, hyphens. */
const PROJECT_ID_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
/** Anything named like production is refused even if it ends up in the allowlist. */
const PROD_LIKE_PATTERN = /(^|-)prod(uction)?(-|$)/;
const CONFIG_KEYS = new Set([
  '$comment',
  'status',
  'approvedBy',
  'approvedAt',
  'adapter',
  'allowedDevProjectIds',
  'deniedProjectIds',
]);

export class GuardError extends Error {
  /**
   * @param {string} code stable identifier used by tests and logs
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = 'GuardError';
    this.code = code;
  }
}

/**
 * @typedef {object} DevTargetsConfig
 * @property {string} status
 * @property {string | null} approvedBy
 * @property {string | null} approvedAt
 * @property {string | null} adapter
 * @property {readonly string[]} allowedDevProjectIds
 * @property {readonly string[]} deniedProjectIds
 */

/** @param {unknown} value */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * @param {Record<string, unknown>} raw
 * @param {string} key
 * @returns {string[]}
 */
function projectIdList(raw, key) {
  const value = raw[key];
  if (!Array.isArray(value) || !value.every((id) => typeof id === 'string' && PROJECT_ID_PATTERN.test(id))) {
    throw new GuardError('CONFIG_INVALID', `${key} must be an array of valid project IDs.`);
  }
  return [...value];
}

/**
 * @param {Record<string, unknown>} raw
 * @param {string} key
 * @returns {string | null}
 */
function optionalString(raw, key) {
  const value = raw[key];
  if (value === null) return null;
  if (!isNonEmptyString(value)) throw new GuardError('CONFIG_INVALID', `${key} must be null or a non-empty string.`);
  return /** @type {string} */ (value);
}

/**
 * Strictly validates infra/deploy/dev-targets.json; anything unexpected fails closed.
 * @param {unknown} raw parsed JSON
 * @returns {DevTargetsConfig}
 */
export function parseDevTargetsConfig(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new GuardError('CONFIG_INVALID', 'dev-targets config must be a JSON object.');
  }
  const record = /** @type {Record<string, unknown>} */ (raw);
  const unknownKeys = Object.keys(record).filter((key) => !CONFIG_KEYS.has(key));
  if (unknownKeys.length > 0) {
    throw new GuardError('CONFIG_INVALID', `Unknown dev-targets config keys: ${unknownKeys.join(', ')}.`);
  }
  if (!isNonEmptyString(record.status)) throw new GuardError('CONFIG_INVALID', 'status must be a non-empty string.');

  const config = {
    status: /** @type {string} */ (record.status),
    approvedBy: optionalString(record, 'approvedBy'),
    approvedAt: optionalString(record, 'approvedAt'),
    adapter: optionalString(record, 'adapter'),
    allowedDevProjectIds: projectIdList(record, 'allowedDevProjectIds'),
    deniedProjectIds: projectIdList(record, 'deniedProjectIds'),
  };

  for (const id of config.allowedDevProjectIds) {
    if (config.deniedProjectIds.includes(id) || PROD_LIKE_PATTERN.test(id)) {
      throw new GuardError('CONFIG_INVALID', `${id} cannot be an allowed dev target: it is denied or production-like.`);
    }
  }
  if (config.allowedDevProjectIds.length > 0 && (config.approvedBy === null || config.approvedAt === null)) {
    throw new GuardError('CONFIG_INVALID', 'An allowlist needs approvedBy and approvedAt from the infrastructure owner.');
  }
  return config;
}

/**
 * @param {unknown} firebaserc parsed .firebaserc, or null when the file does not exist
 */
function definesDefaultProject(firebaserc) {
  if (typeof firebaserc !== 'object' || firebaserc === null) return false;
  const projects = /** @type {{ projects?: unknown }} */ (firebaserc).projects;
  if (typeof projects !== 'object' || projects === null) return false;
  return 'default' in projects;
}

/**
 * Decides whether `npm run deploy:dev` may continue. Throws GuardError otherwise.
 * @param {object} input
 * @param {Readonly<Record<string, string | undefined>>} input.env
 * @param {DevTargetsConfig} input.config
 * @param {unknown} input.firebaserc parsed .firebaserc or null
 * @returns {{ projectId: string, adapter: string }}
 */
export function resolveDevDeployTarget({ env, config, firebaserc }) {
  const raw = env.GM_DEV_PROJECT_ID;
  if (raw === undefined || raw.trim() === '') {
    throw new GuardError(
      'TARGET_EMPTY',
      'GM_DEV_PROJECT_ID is not set. deploy:dev never falls back to a default or ambient project.',
    );
  }
  if (raw !== raw.trim() || !PROJECT_ID_PATTERN.test(raw)) {
    throw new GuardError('TARGET_INVALID', 'GM_DEV_PROJECT_ID is not a valid Google Cloud project ID.');
  }
  const projectId = raw;

  if (config.deniedProjectIds.includes(projectId) || PROD_LIKE_PATTERN.test(projectId)) {
    throw new GuardError(
      'TARGET_PROD',
      `${projectId} is a production target. deploy:dev never deploys to production; production releases belong to the administrator.`,
    );
  }
  if (!config.allowedDevProjectIds.includes(projectId)) {
    throw new GuardError(
      'TARGET_NOT_APPROVED',
      `${projectId} is not in the administrator-approved dev allowlist (infra/deploy/dev-targets.json, P7-INFRA-01). A "-dev" suffix alone is never trusted.`,
    );
  }

  const mismatched = setVariableNames(env, AMBIENT_PROJECT_ENV_VARS).filter((name) => env[name] !== projectId);
  if (mismatched.length > 0) {
    throw new GuardError(
      'AMBIENT_PROJECT_MISMATCH',
      `${mismatched.join(', ')} select a different project than GM_DEV_PROJECT_ID. Unset them; every CLI call passes --project explicitly.`,
    );
  }
  const credentialOverrides = setVariableNames(env, CREDENTIAL_ENV_VARS);
  if (credentialOverrides.length > 0) {
    throw new GuardError(
      'CREDENTIAL_OVERRIDE_SET',
      `${credentialOverrides.join(', ')} is set. deploy:dev only runs with the approved dev identity, never key files or tokens.`,
    );
  }
  if (definesDefaultProject(firebaserc)) {
    throw new GuardError(
      'DEFAULT_PROJECT_CONFIGURED',
      '.firebaserc defines a "default" project. Remove it: nothing may fall back to a default project.',
    );
  }
  if (config.adapter === null) {
    throw new GuardError(
      'ADAPTER_MISSING',
      'No deploy adapter is approved yet. P7-INFRA-01 (deploy method, dev project ID, IAM) must be confirmed by the infrastructure owner first.',
    );
  }
  return { projectId, adapter: config.adapter };
}

/**
 * Every CLI call made by a future deploy adapter must name the project explicitly, exactly once.
 * @param {readonly string[]} args argv of the CLI call
 * @param {string} projectId the target returned by resolveDevDeployTarget
 */
export function assertExplicitProject(args, projectId) {
  /** @type {string[]} */
  const values = [];
  args.forEach((arg, index) => {
    if (arg === '--project' || arg === '-P') values.push(args[index + 1] ?? '');
    else if (arg.startsWith('--project=')) values.push(arg.slice('--project='.length));
  });
  if (values.length !== 1) {
    throw new GuardError('PROJECT_FLAG_MISSING', 'Each CLI call must pass --project exactly once.');
  }
  if (values[0] !== projectId) {
    throw new GuardError('PROJECT_FLAG_MISMATCH', `CLI --project does not match the approved target ${projectId}.`);
  }
}
