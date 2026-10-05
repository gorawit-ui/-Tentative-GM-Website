// Command executor (S08: A4, Part 6 §6.6). One transaction per command:
//   1. `commands/{command_id}`: a stored command with the same fingerprint returns its first result;
//      a different fingerprint (payload, type or actor) is refused (COMMAND_ID_CONFLICT).
//   2. domain rules (@gm/domain) — a refused command stores nothing and uses no number.
//   3. a new request takes the next number from `system_counters/request_sequence` in the same
//      transaction, so concurrent creates never share or skip a number; watching takes none.
// Routing, outbox, projections and history join this transaction in A01/A03/A13.
import type { CommandEnvelope, MaintenanceSelection } from '@gm/contracts';
import type { Actor, Labelled, WatchOutcome } from '@gm/domain';
import type { Instant } from '@gm/time';
import type { CommandStore, CommandTransaction } from './transaction-port';

export const REQUEST_COUNTER_PATH = 'system_counters/request_sequence';
export const COMMANDS_COLLECTION = 'commands';
export const REQUESTS_COLLECTION = 'requests';

/** Refused by the executor itself; domain refusals keep their own error types and codes. */
export class CommandRejected extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'CommandRejected';
    this.code = code;
  }
}

/** Labels for the chosen place, area and symptom, read from the catalog (A11/A12). */
export interface MaintenanceLabels {
  readonly location: Labelled;
  readonly area?: Labelled | undefined;
  readonly symptom: { readonly key: string; readonly label: string };
}

export interface MaintenanceCatalog {
  /** Reads inside the transaction (before any write); unknown or disabled entries are refused. */
  resolve(transaction: CommandTransaction, selection: MaintenanceSelection): Promise<MaintenanceLabels>;
}

export interface CommandContext {
  /** From the verified login (A01), never from the body. */
  readonly actor: Actor;
  /** Server time. */
  readonly now: Instant;
  readonly newRequestId: () => string;
  readonly maintenanceCatalog: MaintenanceCatalog;
}

/** What the client gets back, the same on every retry of the same command ID. */
export interface CommandResult {
  readonly request_id: string;
  readonly request_number: string;
  /** watch_request only. */
  readonly watch?: WatchOutcome;
}

export interface CommandOutcome {
  /** True when this was a retry answered from `commands/{command_id}`. */
  readonly replayed: boolean;
  readonly result: CommandResult;
}

export async function executeCommand(
  _store: CommandStore,
  _command: CommandEnvelope,
  _context: CommandContext,
): Promise<CommandOutcome> {
  throw new Error('not implemented yet (S08)');
}
