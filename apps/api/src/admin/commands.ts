// A11 — Admin commands (Part 3 §13.1–13.4, Part 6 §6.4 “GM Admin แก้ผ่าน API”, FU-30). One transaction
// each, idempotent by `command_id` like request commands (`commands/{id}`: same key + same body →
// the first result again; same key + another body → COMMAND_ID_CONFLICT). The role is checked before
// anything is read; the rules are @gm/domain's; every read happens before the first write.
//   locations/{id}      label, active, order                  (5 from the brief; closed, never deleted)
//   areas/{id}          location_id, label, active, order, qr_id?
//   qr_codes/{qr_id}    location_id, area_id, active          (random 128-bit ID, moves without reprint)
//   calendars/company   timezone, open_weekdays, holidays (ค.ศ.), holiday_names, revision
//   settings/notifications  working_morning_time (FU-30, D-S06-2)
import type { AdminCommand } from '@gm/contracts';
import {
  PLACE_SEED,
  companyCalendarContentOf,
  planAreaActive,
  planLocationActive,
  planMoveQr,
  planNewArea,
  planOpenWeekdays,
  planPutHoliday,
  planQrActive,
  planQrForArea,
  planRemoveHoliday,
  planRenameArea,
  requireGmAdmin,
  type Actor,
  type AreaFacts,
  type CompanyCalendarContent,
  type LocationFacts,
  type QrFacts,
} from '@gm/domain';
import type { Instant } from '@gm/time';
import { COMMANDS_COLLECTION, COMMAND_EXPIRY_FIELD, COMMAND_RETENTION_MS, CommandRejected } from '../commands/execute-command';
import { commandFingerprint } from '../commands/fingerprint';
import type { CommandStore, CommandTransaction, StoredData } from '../commands/transaction-port';

export const COMPANY_CALENDAR_PATH = 'calendars/company';
export const NOTIFICATION_SETTINGS_PATH = 'settings/notifications';
/** Bounded read of one location's areas (names must stay unique within it). */
export const MAX_AREAS_PER_LOCATION = 200;

export interface AdminCommandContext {
  readonly actor: Actor;
  readonly now: Instant;
  /** Suffix of a new area's ID (`area-{suffix}`). */
  readonly newAreaId: () => string;
  /** A new QR code ID: 128 random bits, base64url (22 characters). */
  readonly newQrId: () => string;
}

export type AdminCommandResult = Readonly<Record<string, unknown>>;

export interface AdminCommandOutcome {
  readonly replayed: boolean;
  readonly result: AdminCommandResult;
}

const locationPath = (id: string) => `locations/${id}`;
const areaPath = (id: string) => `areas/${id}`;
const qrPath = (id: string) => `qr_codes/${id}`;

const locationFacts = (id: string, stored: StoredData | undefined): LocationFacts | undefined =>
  stored === undefined ? undefined : { id, label: String(stored.label ?? ''), active: stored.active !== false };

const areaFacts = (id: string, stored: StoredData | undefined): AreaFacts | undefined =>
  stored === undefined
    ? undefined
    : {
        id,
        locationId: String(stored.location_id ?? ''),
        label: String(stored.label ?? ''),
        active: stored.active !== false,
        ...(typeof stored.qr_id === 'string' ? { qrId: stored.qr_id } : {}),
      };

const qrFacts = (id: string, stored: StoredData | undefined): QrFacts | undefined =>
  stored === undefined ? undefined : { id, areaId: String(stored.area_id ?? ''), locationId: String(stored.location_id ?? ''), active: stored.active !== false };

async function siblingAreas(transaction: CommandTransaction, locationId: string): Promise<readonly AreaFacts[]> {
  if (transaction.list === undefined) throw new Error('this store cannot list areas');
  const rows = await transaction.list('areas', 'location_id', locationId, MAX_AREAS_PER_LOCATION);
  return rows.map((row) => areaFacts(row.id, row.data)).filter((area): area is AreaFacts => area !== undefined);
}

function calendarDocument(content: CompanyCalendarContent, stored: StoredData | undefined, now: Instant): Record<string, unknown> {
  const revision = typeof stored?.revision === 'number' ? stored.revision : 0;
  return {
    timezone: content.timezone,
    open_weekdays: [...content.openWeekdays],
    holidays: [...content.holidays],
    holiday_names: { ...content.holidayNames },
    revision: revision + 1,
    ...(stored?.created_at === undefined ? { created_at: now } : { created_at: stored.created_at }),
    updated_at: now,
  };
}

async function run(transaction: CommandTransaction, command: AdminCommand, context: AdminCommandContext, areaSuffix: string, qrId: string): Promise<AdminCommandResult> {
  const { now } = context;
  switch (command.type) {
    case 'seed_places': {
      const locations = await Promise.all(PLACE_SEED.locations.map((location) => transaction.get(locationPath(location.id))));
      const areas = await Promise.all(PLACE_SEED.areas.map((area) => transaction.get(areaPath(area.id))));
      let created = 0;
      PLACE_SEED.locations.forEach((location, index) => {
        if (locations[index] !== undefined) return;
        transaction.set(locationPath(location.id), { label: location.label, active: true, order: location.order, created_at: now, updated_at: now });
        created += 1;
      });
      PLACE_SEED.areas.forEach((area, index) => {
        if (areas[index] !== undefined) return;
        transaction.set(areaPath(area.id), { location_id: area.locationId, label: area.label, active: true, order: area.order, created_at: now, updated_at: now });
        created += 1;
      });
      return { created };
    }
    case 'add_area': {
      const { location_id: locationId, label } = command.payload;
      const location = locationFacts(locationId, await transaction.get(locationPath(locationId)));
      const siblings = location === undefined ? [] : await siblingAreas(transaction, locationId);
      const planned = planNewArea(location, siblings, label);
      const areaId = `area-${areaSuffix}`;
      transaction.set(areaPath(areaId), { location_id: planned.locationId, label: planned.label, active: true, order: siblings.length + 1, created_at: now, updated_at: now });
      return { area_id: areaId };
    }
    case 'rename_area': {
      const { area_id: areaId, label } = command.payload;
      const area = areaFacts(areaId, await transaction.get(areaPath(areaId)));
      const siblings = area === undefined ? [] : await siblingAreas(transaction, area.locationId);
      const planned = planRenameArea(area, siblings, label);
      transaction.update(areaPath(areaId), { label: planned.label, updated_at: now });
      return { area_id: areaId };
    }
    case 'set_area_active': {
      const { area_id: areaId, active } = command.payload;
      const planned = planAreaActive(areaFacts(areaId, await transaction.get(areaPath(areaId))), active);
      transaction.update(areaPath(areaId), { active: planned.active, updated_at: now });
      return { area_id: areaId, active: planned.active };
    }
    case 'set_location_active': {
      const { location_id: locationId, active } = command.payload;
      const planned = planLocationActive(locationFacts(locationId, await transaction.get(locationPath(locationId))), active);
      transaction.update(locationPath(locationId), { active: planned.active, updated_at: now });
      return { location_id: locationId, active: planned.active };
    }
    case 'create_qr': {
      const { area_id: areaId } = command.payload;
      const planned = planQrForArea(areaFacts(areaId, await transaction.get(areaPath(areaId))));
      if ((await transaction.get(qrPath(qrId))) !== undefined) throw new CommandRejected('QR_ID_COLLISION', 'Generated QR ID already exists; try again');
      transaction.set(qrPath(qrId), { location_id: planned.locationId, area_id: planned.areaId, active: true, created_at: now, updated_at: now });
      transaction.update(areaPath(areaId), { qr_id: qrId, updated_at: now });
      return { qr_id: qrId, area_id: areaId };
    }
    case 'move_qr': {
      const { qr_id: id, area_id: toId } = command.payload;
      const qr = qrFacts(id, await transaction.get(qrPath(id)));
      const fromStored = qr === undefined ? undefined : await transaction.get(areaPath(qr.areaId));
      const to = areaFacts(toId, await transaction.get(areaPath(toId)));
      const planned = planMoveQr(qr, areaFacts(qr?.areaId ?? '', fromStored), to);
      transaction.update(qrPath(id), { area_id: planned.areaId, location_id: planned.locationId, updated_at: now });
      if (qr !== undefined && fromStored !== undefined && fromStored.qr_id === id) {
        const { qr_id: _moved, ...rest } = fromStored;
        transaction.set(areaPath(qr.areaId), { ...rest, updated_at: now });
      }
      transaction.update(areaPath(toId), { qr_id: id, updated_at: now });
      return { qr_id: id, area_id: planned.areaId };
    }
    case 'set_qr_active': {
      const { qr_id: id, active } = command.payload;
      const planned = planQrActive(qrFacts(id, await transaction.get(qrPath(id))), active);
      transaction.update(qrPath(id), { active: planned.active, updated_at: now });
      return { qr_id: id, active: planned.active };
    }
    case 'set_open_weekdays':
    case 'put_holiday':
    case 'remove_holiday': {
      const stored = await transaction.get(COMPANY_CALENDAR_PATH);
      const current = companyCalendarContentOf(stored);
      const next =
        command.type === 'set_open_weekdays'
          ? planOpenWeekdays(current, command.payload.open_weekdays)
          : command.type === 'put_holiday'
            ? planPutHoliday(current, command.payload)
            : planRemoveHoliday(current, command.payload.date);
      const document = calendarDocument(next, stored, now);
      transaction.set(COMPANY_CALENDAR_PATH, document);
      return { revision: document.revision };
    }
    case 'set_reminder_time': {
      const stored = await transaction.get(NOTIFICATION_SETTINGS_PATH);
      transaction.set(NOTIFICATION_SETTINGS_PATH, { ...stored, working_morning_time: command.payload.working_morning_time, updated_at: now });
      return { working_morning_time: command.payload.working_morning_time };
    }
  }
}

export async function executeAdminCommand(store: CommandStore, command: AdminCommand, context: AdminCommandContext): Promise<AdminCommandOutcome> {
  requireGmAdmin(context.actor);
  const fingerprint = commandFingerprint(context.actor.personId, command);
  const commandPath = `${COMMANDS_COLLECTION}/${command.command_id}`;
  // Chosen once, so every attempt of the transaction writes the same IDs.
  const areaSuffix = context.newAreaId();
  const qrId = context.newQrId();
  return store.runTransaction(async (transaction) => {
    const stored = await transaction.get(commandPath);
    if (stored !== undefined) {
      if (stored.fingerprint !== fingerprint) throw new CommandRejected('COMMAND_ID_CONFLICT', 'This command ID was already used for a different command');
      return { replayed: true, result: stored.result as AdminCommandResult };
    }
    const result = await run(transaction, command, context, areaSuffix, qrId);
    transaction.set(commandPath, {
      type: `admin.${command.type}`,
      actor_id: context.actor.personId,
      fingerprint,
      result,
      created_at: context.now,
      [COMMAND_EXPIRY_FIELD]: context.now + COMMAND_RETENTION_MS,
    });
    return { replayed: false, result };
  });
}
