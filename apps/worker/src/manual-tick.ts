// A02 — dev manual tick: `npm run tick:local -w @gm/worker` asks the worker that `npm run dev` runs
// on this machine (against the emulators) to run one tick. Part 6 §6.2: dev uses a manual tick; no
// paused Scheduler job is created. It only ever calls a worker on this machine.
import { pathToFileURL } from 'node:url';
import { TICK_PATH } from './routes';

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

export function manualTickUrl(env: { readonly GM_WORKER_URL?: string; readonly PORT?: string }): URL {
  const base = env.GM_WORKER_URL ?? `http://127.0.0.1:${env.PORT ?? '8788'}`;
  const url = new URL(TICK_PATH, base);
  if (url.protocol !== 'http:' || !LOOPBACK.has(url.hostname)) {
    throw new RangeError('the manual tick only calls the worker on this machine (http://127.0.0.1:<port>)');
  }
  return url;
}

async function main(): Promise<void> {
  const url = manualTickUrl(process.env);
  const response = await fetch(url, { method: 'POST' });
  console.info(`tick ${response.status}: ${await response.text()}`);
  if (!response.ok) process.exitCode = 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'manual tick failed');
    process.exitCode = 1;
  });
}
