// A01 — directory reads used by create commands, through the command transaction port (stub).
import type { GmMember, RoutingSettings } from '@gm/domain';
import type { CalendarSnapshot } from '@gm/time';
import type { CommandTransaction } from '../commands/transaction-port';
import type { PeopleDirectory } from '../commands/execute-command';

export interface RoutingFacts {
  readonly settings: RoutingSettings;
  readonly members: readonly GmMember[];
  readonly workCalendar: CalendarSnapshot;
}

export interface RoutingDirectory {
  load(transaction: CommandTransaction): Promise<RoutingFacts>;
}

export function transactionPeopleDirectory(): PeopleDirectory {
  return { displayNames: () => Promise.reject(new Error('NOT_IMPLEMENTED')) };
}

export function transactionRoutingDirectory(): RoutingDirectory {
  return { load: () => Promise.reject(new Error('NOT_IMPLEMENTED')) };
}
