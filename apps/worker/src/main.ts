// gm-worker entrypoint (Cloud Run, IAM-only; locally against the emulators with `npm run dev`).
// A02: the tick (one Scheduler job in prod, manual tick in dev) and outbox tasks. Notifications use
// the local or disabled adapter only until A07/A08. Credentials come from the runtime; nothing here
// creates cloud resources. Not imported by tests.
import { randomUUID } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { notificationAdapter } from './adapters';
import type { WorkerDeps } from './deps';
import { adminWorkerStore } from './firestore-store';
import { createWorkerHandler, workerOperations } from './http';
import { consoleWorkerLogger } from './log';
import { resolveNotificationMode } from './notification-mode';
import { startServer } from './server';

const notificationMode = resolveNotificationMode(process.env.GM_NOTIFICATION_ADAPTER);
console.info(`gm-worker notification adapter: ${notificationMode}`);
const db = getFirestore(initializeApp());
const deps: WorkerDeps = {
  store: adminWorkerStore(db),
  adapter: notificationAdapter(notificationMode, consoleWorkerLogger),
  now: () => Date.now(),
  newLeaseId: () => randomUUID(),
  log: consoleWorkerLogger,
  // Job handlers arrive with their tasks (A05 stale/auto-close/presence, B09 digest, B15 renewal…).
  jobHandlers: {},
};
startServer({
  name: 'gm-worker',
  handler: createWorkerHandler({ notificationMode, operations: workerOperations(deps), log: consoleWorkerLogger }),
  defaultPort: 8788,
});
