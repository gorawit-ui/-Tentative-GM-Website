// gm-worker entrypoint (Cloud Run, IAM-only; locally against the emulators with `npm run dev`).
// A02: the tick (one Scheduler job in prod, manual tick in dev) and outbox tasks. Notifications use
// the local or disabled adapter only: A07's Slack adapter is wired after P7-ADMIN-03 (FU-33), A08's
// e-mail after P7-ADMIN-02. `GM_WEB_BASE_URL` is where message links point (P7-INFRA-01 sets the real
// domain). Credentials come from the runtime; nothing here creates cloud resources. Not imported by tests.
import { randomUUID } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { transactionPeopleDirectory, transactionRoutingDirectory } from '@gm/api/directories';
import { notificationAdapter } from './adapters';
import type { WorkerDeps } from './deps';
import { adminWorkerStore } from './firestore-store';
import { createWorkerHandler, workerOperations } from './http';
import { workerJobHandlers } from './jobs/index';
import { consoleWorkerLogger } from './log';
import { resolveNotificationMode, resolveWebBaseUrl } from './notification-mode';
import { startServer } from './server';

const notificationMode = resolveNotificationMode(process.env.GM_NOTIFICATION_ADAPTER);
const webBaseUrl = resolveWebBaseUrl(process.env.GM_WEB_BASE_URL);
console.info(`gm-worker notification adapter: ${notificationMode}`);
const db = getFirestore(initializeApp());
const deps: WorkerDeps = {
  store: adminWorkerStore(db),
  adapter: notificationAdapter(notificationMode, consoleWorkerLogger, { webBaseUrl }),
  now: () => Date.now(),
  newLeaseId: () => randomUUID(),
  log: consoleWorkerLogger,
  // A03 auto-close, A05 stale + presence reset; the rest arrive with their tasks (B09 digest, B15 renewal…).
  jobHandlers: workerJobHandlers({ peopleDirectory: transactionPeopleDirectory(), routingDirectory: transactionRoutingDirectory() }),
};
startServer({
  name: 'gm-worker',
  handler: createWorkerHandler({ notificationMode, operations: workerOperations(deps), log: consoleWorkerLogger }),
  defaultPort: 8788,
});
