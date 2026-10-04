// @ts-check
/**
 * Preload for `node --import` in tests that must prove a script makes no network call and
 * starts no child process (e.g. the deploy:dev guard). Every attempt is refused and recorded;
 * the list is written as JSON to the file named by GM_NO_NETWORK_REPORT when the process exits.
 */
import childProcess from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { installNetworkBlock } from './network-block.mjs';

/** @type {string[]} */
const attempts = [];
installNetworkBlock({ onAttempt: (description) => attempts.push(description) });

const spawnFunctions = /** @type {const} */ (['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']);
const childProcessModule = /** @type {any} */ (childProcess);
for (const name of spawnFunctions) {
  childProcessModule[name] = (/** @type {unknown} */ command) => {
    attempts.push(`child_process.${name} ${String(command)}`);
    throw new Error(`Child processes are blocked in this process (${name}).`);
  };
}
syncBuiltinESMExports();

const reportPath = process.env.GM_NO_NETWORK_REPORT;
process.on('exit', () => {
  if (reportPath) writeFileSync(reportPath, JSON.stringify({ attempts }));
});
