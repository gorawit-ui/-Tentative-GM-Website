// A01 — directory reads used by create commands, through the command transaction port (so every
// read stays inside the same transaction, before any write). Production stores:
//   people/{person_id}          name, active, team_label           (P7-ADMIN-01 CSV, A10; team: FU-10)
//   settings/routing            default_owner_by_type, gm_person_ids (P7-ADMIN-04, A10)
//   gm_profiles/{person_id}     presence_status, leave_ends_on, presence_updated_at
//   calendars/company           timezone, open_weekdays, holidays    (P7-ADMIN-04, A11)
// Missing routing settings or company calendar refuse the command rather than guess (fail closed).
import { isPersonId } from '@gm/contracts';
import { REQUEST_TYPES, type GmMember, type GmProfile, type PresenceStatus, type RoutingSettings } from '@gm/domain';
import { snapshotCalendar, type CalendarSnapshot, type IsoWeekday } from '@gm/time';
import { CommandRejected, type PeopleDirectory, type ReadTransaction, type RoutingDirectory } from '../commands/execute-command';
import type { StoredData } from '../commands/transaction-port';

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);

export function transactionPeopleDirectory(): PeopleDirectory {
  return {
    async displayNames(transaction, personIds) {
      const names = new Map<string, string>();
      for (const personId of new Set(personIds)) {
        if (!isPersonId(personId)) continue;
        const person = await transaction.get(`people/${personId}`);
        const name = typeof person?.name === 'string' ? person.name.trim() : '';
        if (name !== '') names.set(personId, name);
      }
      return names;
    },
    async teamLabels(transaction, personIds) {
      const teams = new Map<string, string>();
      for (const personId of new Set(personIds)) {
        if (!isPersonId(personId)) continue;
        const person = await transaction.get(`people/${personId}`);
        const team = typeof person?.team_label === 'string' ? person.team_label.trim() : '';
        if (team !== '') teams.set(personId, team);
      }
      return teams;
    },
  };
}

function presenceOf(stored: StoredData | undefined): PresenceStatus {
  const status = stored?.presence_status as { kind?: unknown; location_id?: unknown } | undefined;
  if (status?.kind === 'at_location' && typeof status.location_id === 'string') return { kind: 'at_location', locationId: status.location_id };
  if (status?.kind === 'off_site' || status?.kind === 'on_leave') return { kind: status.kind };
  return { kind: 'unspecified' };
}

/** `gm_profiles/{person_id}` as the domain profile (also used by the worker's presence reset, A05). */
export function gmProfileOf(personId: string, stored: StoredData | undefined): GmProfile | undefined {
  if (stored === undefined) return undefined;
  return {
    personId,
    presenceStatus: presenceOf(stored),
    ...(typeof stored.presence_updated_at === 'number' ? { presenceUpdatedAt: stored.presence_updated_at } : {}),
    ...(typeof stored.leave_ends_on === 'string' ? { leaveEndsOn: stored.leave_ends_on } : {}),
    ...(typeof stored.focus_request_id === 'string' ? { focusRequestId: stored.focus_request_id } : {}),
  };
}

/**
 * The company work calendar as it is now (`calendars/company`, P7-ADMIN-04 / A11). Stale uses it
 * (FU-27 decision, A05); missing → refused rather than guessed (D-A01-2).
 */
export async function transactionCompanyCalendar(transaction: ReadTransaction): Promise<CalendarSnapshot> {
  const calendar = await transaction.get('calendars/company');
  if (calendar === undefined) throw new CommandRejected('CALENDAR_NOT_CONFIGURED', 'The company work calendar is not set up yet');
  return companyCalendarOf(calendar);
}

export function companyCalendarOf(calendar: StoredData): CalendarSnapshot {
  return snapshotCalendar({
    timeZone: String(calendar.timezone),
    openWeekdays: (Array.isArray(calendar.open_weekdays) ? calendar.open_weekdays : []) as IsoWeekday[],
    holidays: strings(calendar.holidays),
  });
}

export function transactionRoutingDirectory(): RoutingDirectory {
  return {
    async load(transaction) {
      const routing = await transaction.get('settings/routing');
      if (routing === undefined) throw new CommandRejected('ROUTING_NOT_CONFIGURED', 'Default owners and GM members are not set up yet');
      const workCalendar = await transactionCompanyCalendar(transaction);
      const owners = (routing.default_owner_by_type ?? {}) as Record<string, unknown>;
      const defaultOwnerByType: RoutingSettings['defaultOwnerByType'] = Object.fromEntries(
        REQUEST_TYPES.filter((type) => type !== 'gm_task' && isPersonId(owners[type])).map((type) => [type, owners[type] as string]),
      );
      const members: GmMember[] = [];
      for (const personId of new Set(strings(routing.gm_person_ids).filter(isPersonId))) {
        const person = await transaction.get(`people/${personId}`);
        const profile = await transaction.get(`gm_profiles/${personId}`);
        members.push({ personId, active: person?.active === true, profile: gmProfileOf(personId, profile) });
      }
      return {
        settings: { defaultOwnerByType },
        members,
        workCalendar,
      };
    },
  };
}
