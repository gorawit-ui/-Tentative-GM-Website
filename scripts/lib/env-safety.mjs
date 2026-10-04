// @ts-check
// Environment variables that could point local tooling at a real Google Cloud / Firebase
// project or real credentials. Shared by the emulator wrapper and the dev deploy guard.

/** Ambient project selectors read implicitly by gcloud, firebase-tools and the Google SDKs. */
export const AMBIENT_PROJECT_ENV_VARS = Object.freeze([
  'GOOGLE_CLOUD_PROJECT',
  'GCLOUD_PROJECT',
  'CLOUDSDK_CORE_PROJECT',
  'GCP_PROJECT',
  'FIREBASE_PROJECT',
]);

/** Credential overrides: key files and tokens instead of the approved interactive identity (Part 6 §6.13). */
export const CREDENTIAL_ENV_VARS = Object.freeze([
  'GOOGLE_APPLICATION_CREDENTIALS',
  'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE',
  'CLOUDSDK_AUTH_ACCESS_TOKEN_FILE',
  'GOOGLE_OAUTH_ACCESS_TOKEN',
  'FIREBASE_TOKEN',
]);

/**
 * Names (never values) of variables from `names` that are set to a non-empty value.
 * @param {Readonly<Record<string, string | undefined>>} env
 * @param {readonly string[]} names
 * @returns {string[]}
 */
export function setVariableNames(env, names) {
  return names.filter((name) => {
    const value = env[name];
    return value !== undefined && value !== '';
  });
}
