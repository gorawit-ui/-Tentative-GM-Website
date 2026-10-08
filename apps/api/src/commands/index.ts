// Command pipeline of gm-api (S08): idempotent command IDs and the request number counter;
// A03 lifecycle commands and the auto-close transaction the worker runs.
export {
  COMMANDS_COLLECTION,
  COMMAND_EXPIRY_FIELD,
  COMMAND_RETENTION_MS,
  CommandRejected,
  GM_REQUEST_DETAILS_COLLECTION,
  REQUESTS_COLLECTION,
  REQUEST_COUNTER_PATH,
  executeCommand,
  type CommandContext,
  type CommandOutcome,
  type CommandResult,
  type MaintenanceCatalog,
  type MaintenanceLabels,
  type PeopleDirectory,
  type ReadTransaction,
  type RoutingDirectory,
  type RoutingFacts,
} from './execute-command';
export {
  SCHEDULED_WORK_COLLECTION,
  autoCloseInTransaction,
  autoCloseJobId,
  runLifecycleCommand,
  type AutoCloseOutcome,
  type LifecycleDirectories,
  type RecordTransaction,
} from './lifecycle';
export { commandFingerprint } from './fingerprint';
export { STATUS_NOTICE_KINDS } from './outbox';
export type { CommandStore, CommandTransaction, StoredData } from './transaction-port';
