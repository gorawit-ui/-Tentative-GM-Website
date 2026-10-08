// gm-api entrypoint (Cloud Run; locally against the emulators). A01: the HTTP API with auth on
// every request. Credentials come from the runtime (Cloud Run service account / emulator env);
// nothing here creates cloud resources. Not imported by tests.
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { REQUEST_NUMBER_PREFIXES, type DeploymentEnvironment } from '@gm/domain';
import { CommandRejected } from './commands/index';
import { consoleLogger, storageUrlSigner, type StorageBucket } from './endpoints/index';
import type { SignableBucket } from './endpoints/url-signer';
import { adminCommandStore } from './firestore/admin-store';
import { transactionPeopleDirectory, transactionRoutingDirectory } from './firestore/directories';
import { createApiHandler } from './http/app';
import { resolveAllowedOrigins } from './http/cors';

function environmentOf(value: string | undefined): DeploymentEnvironment {
  const environment = value ?? 'local';
  if (!Object.hasOwn(REQUEST_NUMBER_PREFIXES, environment)) throw new Error('GM_ENVIRONMENT must be prod, dev or local');
  return environment as DeploymentEnvironment;
}

const environment = environmentOf(process.env.GM_ENVIRONMENT);
const app = initializeApp();
const bucket = getStorage(app).bucket(process.env.GM_ATTACHMENT_BUCKET);
const db = getFirestore(app);

const handler = createApiHandler({
  api: {
    db,
    auth: getAuth(app),
    bucket: bucket as unknown as StorageBucket,
    signer: storageUrlSigner(bucket as unknown as SignableBucket),
    now: () => Date.now(),
    newId: () => `up-${randomUUID()}`,
    log: consoleLogger,
  },
  commandStore: adminCommandStore(db),
  environment,
  allowedOrigins: resolveAllowedOrigins(environment, process.env.GM_ALLOWED_ORIGINS),
  newRequestId: () => `req-${randomUUID()}`,
  // Places/areas/symptoms come with A11/A12; until then repair requests are refused, not guessed.
  maintenanceCatalog: { resolve: async () => Promise.reject(new CommandRejected('CATALOG_NOT_READY', 'Locations and symptoms are not set up yet')) },
  peopleDirectory: transactionPeopleDirectory(),
  routingDirectory: transactionRoutingDirectory(),
  // The Cloud Tasks client needs the queue, region and service account from P7-INFRA-01 (FU-20);
  // until then entries stay `pending` and the worker's tick sends them (A02 outbox recovery).
  taskQueue: { enqueue: async () => undefined },
});

const port = Number(process.env.PORT ?? 8787);
if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error('gm-api: PORT must be an integer between 0 and 65535');
const host = process.env.HOST ?? '127.0.0.1';
const server = createServer(handler);
server.listen(port, host, () => consoleLogger.info('server.listening', { status: port }));
const shutdown = () => {
  server.close(() => process.exit(0));
  server.closeIdleConnections();
  setTimeout(() => process.exit(0), 5_000).unref();
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
