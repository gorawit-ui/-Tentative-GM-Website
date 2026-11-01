// A11 — Admin commands at the API boundary (Part 3 §13, Part 6 §6.4 “GM Admin แก้ผ่าน API”): the same
// strict envelope as request commands — a lowercase UUID per action is the idempotency key, so a retry
// never runs twice. Only the shape is read here; the API checks the role and the domain decides.
// Dates travel as ค.ศ. `YYYY-MM-DD` (the page converts from พ.ศ. with preview, D-S01-6).
import { ROLES, isQrId, type Role } from '@gm/domain';
import { isIsoDate, isLocalTimeOfDay } from '@gm/time';
import { personIdField, personIdFromCsvEmail } from './person-id';
import {
  ContractRejected,
  enumField,
  idField,
  isPlainObject,
  join,
  requiredField,
  strictObject,
  stringField,
  type JsonObject,
} from './strict';

export const ADMIN_COMMAND_TYPES = [
  'seed_places',
  'add_location',
  'rename_location',
  'add_area',
  'rename_area',
  'set_area_active',
  'set_location_active',
  'create_qr',
  'move_qr',
  'set_qr_active',
  'set_open_weekdays',
  'put_holiday',
  'remove_holiday',
  'set_reminder_time',
  'set_person_role',
  'set_person_active',
  'add_person',
  'update_person',
] as const;
export type AdminCommandType = (typeof ADMIN_COMMAND_TYPES)[number];

export type AdminCommand =
  | { readonly command_id: string; readonly type: 'seed_places'; readonly payload: Record<string, never> }
  | { readonly command_id: string; readonly type: 'add_location'; readonly payload: { readonly label: string } }
  | { readonly command_id: string; readonly type: 'rename_location'; readonly payload: { readonly location_id: string; readonly label: string } }
  | { readonly command_id: string; readonly type: 'add_area'; readonly payload: { readonly location_id: string; readonly label: string } }
  | { readonly command_id: string; readonly type: 'rename_area'; readonly payload: { readonly area_id: string; readonly label: string } }
  | { readonly command_id: string; readonly type: 'set_area_active'; readonly payload: { readonly area_id: string; readonly active: boolean } }
  | { readonly command_id: string; readonly type: 'set_location_active'; readonly payload: { readonly location_id: string; readonly active: boolean } }
  | { readonly command_id: string; readonly type: 'create_qr'; readonly payload: { readonly area_id: string } }
  | { readonly command_id: string; readonly type: 'move_qr'; readonly payload: { readonly qr_id: string; readonly area_id: string } }
  | { readonly command_id: string; readonly type: 'set_qr_active'; readonly payload: { readonly qr_id: string; readonly active: boolean } }
  | { readonly command_id: string; readonly type: 'set_open_weekdays'; readonly payload: { readonly open_weekdays: readonly number[] } }
  | { readonly command_id: string; readonly type: 'put_holiday'; readonly payload: { readonly date: string; readonly name: string; readonly replaces?: string } }
  | { readonly command_id: string; readonly type: 'remove_holiday'; readonly payload: { readonly date: string } }
  | { readonly command_id: string; readonly type: 'set_reminder_time'; readonly payload: { readonly working_morning_time: string } }
  | { readonly command_id: string; readonly type: 'set_person_role'; readonly payload: { readonly person_id: string; readonly role: Role } }
  | {
      readonly command_id: string;
      readonly type: 'set_person_active';
      /** D-A10-2: switching off a GM with open requests carries the count the Admin confirmed. */
      readonly payload: { readonly person_id: string; readonly active: boolean; readonly release_open_requests?: number };
    }
  | { readonly command_id: string; readonly type: 'add_person'; readonly payload: { readonly email: string; readonly name: string; readonly team?: string } }
  /** D-A10-6: name and team edited by hand (no team = cleared); the next CSV import writes over them. */
  | { readonly command_id: string; readonly type: 'update_person'; readonly payload: { readonly person_id: string; readonly name: string; readonly team?: string } };

const COMMAND_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function booleanField(object: JsonObject, path: string, key: string): boolean {
  const value = requiredField(object, path, key);
  if (typeof value !== 'boolean') throw new ContractRejected('FIELD_TYPE', join(path, key), `${join(path, key)} must be true or false`);
  return value;
}

function qrIdField(object: JsonObject, path: string, key: string): string {
  const value = stringField(object, path, key);
  if (!isQrId(value)) throw new ContractRejected('FIELD_INVALID', join(path, key), `${join(path, key)} is not a QR code ID`);
  return value;
}

function dateField(object: JsonObject, path: string, key: string): string {
  const value = stringField(object, path, key);
  if (!isIsoDate(value)) throw new ContractRejected('FIELD_INVALID', join(path, key), `${join(path, key)} must be a ค.ศ. YYYY-MM-DD date`);
  return value;
}

function weekdaysField(object: JsonObject, path: string, key: string): readonly number[] {
  const value = requiredField(object, path, key);
  if (!Array.isArray(value)) throw new ContractRejected('FIELD_TYPE', join(path, key), `${join(path, key)} must be a list of ISO weekdays`);
  const valid = value.length > 0 && value.every((day) => Number.isInteger(day) && day >= 1 && day <= 7) && new Set(value).size === value.length;
  if (!valid) throw new ContractRejected('FIELD_INVALID', join(path, key), `${join(path, key)} must list distinct ISO weekdays 1–7, at least one`);
  return value as number[];
}

function payloadOf(type: AdminCommandType, value: unknown): AdminCommand['payload'] {
  const path = 'payload';
  switch (type) {
    case 'seed_places':
      strictObject(value, path, []);
      return {};
    case 'add_location': {
      const payload = strictObject(value, path, ['label']);
      return { label: stringField(payload, path, 'label') };
    }
    case 'rename_location': {
      const payload = strictObject(value, path, ['location_id', 'label']);
      return { location_id: idField(payload, path, 'location_id'), label: stringField(payload, path, 'label') };
    }
    case 'add_area': {
      const payload = strictObject(value, path, ['location_id', 'label']);
      return { location_id: idField(payload, path, 'location_id'), label: stringField(payload, path, 'label') };
    }
    case 'rename_area': {
      const payload = strictObject(value, path, ['area_id', 'label']);
      return { area_id: idField(payload, path, 'area_id'), label: stringField(payload, path, 'label') };
    }
    case 'set_area_active': {
      const payload = strictObject(value, path, ['area_id', 'active']);
      return { area_id: idField(payload, path, 'area_id'), active: booleanField(payload, path, 'active') };
    }
    case 'set_location_active': {
      const payload = strictObject(value, path, ['location_id', 'active']);
      return { location_id: idField(payload, path, 'location_id'), active: booleanField(payload, path, 'active') };
    }
    case 'create_qr': {
      const payload = strictObject(value, path, ['area_id']);
      return { area_id: idField(payload, path, 'area_id') };
    }
    case 'move_qr': {
      const payload = strictObject(value, path, ['qr_id', 'area_id']);
      return { qr_id: qrIdField(payload, path, 'qr_id'), area_id: idField(payload, path, 'area_id') };
    }
    case 'set_qr_active': {
      const payload = strictObject(value, path, ['qr_id', 'active']);
      return { qr_id: qrIdField(payload, path, 'qr_id'), active: booleanField(payload, path, 'active') };
    }
    case 'set_open_weekdays': {
      const payload = strictObject(value, path, ['open_weekdays']);
      return { open_weekdays: weekdaysField(payload, path, 'open_weekdays') };
    }
    case 'put_holiday': {
      const payload = strictObject(value, path, ['date', 'name', 'replaces']);
      const date = dateField(payload, path, 'date');
      const name = stringField(payload, path, 'name');
      return Object.hasOwn(payload, 'replaces') ? { date, name, replaces: dateField(payload, path, 'replaces') } : { date, name };
    }
    case 'remove_holiday': {
      const payload = strictObject(value, path, ['date']);
      return { date: dateField(payload, path, 'date') };
    }
    case 'set_person_role': {
      const payload = strictObject(value, path, ['person_id', 'role']);
      return { person_id: personIdField(payload, path, 'person_id'), role: enumField(payload, path, 'role', ROLES) };
    }
    case 'set_person_active': {
      const payload = strictObject(value, path, ['person_id', 'active', 'release_open_requests']);
      const parsed = { person_id: personIdField(payload, path, 'person_id'), active: booleanField(payload, path, 'active') };
      if (!Object.hasOwn(payload, 'release_open_requests')) return parsed;
      const count = payload.release_open_requests;
      if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
        throw new ContractRejected('FIELD_INVALID', join(path, 'release_open_requests'), 'release_open_requests must be a whole number ≥ 0');
      }
      return { ...parsed, release_open_requests: count };
    }
    case 'add_person': {
      const payload = strictObject(value, path, ['email', 'name', 'team']);
      const email = personIdFromCsvEmail(stringField(payload, path, 'email'), join(path, 'email'));
      const name = stringField(payload, path, 'name');
      return Object.hasOwn(payload, 'team') ? { email, name, team: stringField(payload, path, 'team') } : { email, name };
    }
    case 'update_person': {
      const payload = strictObject(value, path, ['person_id', 'name', 'team']);
      const personId = personIdField(payload, path, 'person_id');
      const name = stringField(payload, path, 'name');
      return Object.hasOwn(payload, 'team') ? { person_id: personId, name, team: stringField(payload, path, 'team') } : { person_id: personId, name };
    }
    case 'set_reminder_time': {
      const payload = strictObject(value, path, ['working_morning_time']);
      const time = stringField(payload, path, 'working_morning_time');
      if (!isLocalTimeOfDay(time)) throw new ContractRejected('FIELD_INVALID', join(path, 'working_morning_time'), 'working_morning_time must be HH:MM');
      return { working_morning_time: time };
    }
  }
}

export function parseAdminCommand(body: unknown): AdminCommand {
  if (!isPlainObject(body)) throw new ContractRejected('BODY_INVALID', '', 'the body must be a JSON object');
  const envelope = strictObject(body, '', ['command_id', 'type', 'payload']);
  const commandId = envelope.command_id;
  if (typeof commandId !== 'string' || !COMMAND_ID_PATTERN.test(commandId)) {
    throw new ContractRejected('COMMAND_ID_INVALID', 'command_id', 'command_id must be a lowercase UUID');
  }
  const type = envelope.type;
  if (typeof type !== 'string' || !(ADMIN_COMMAND_TYPES as readonly string[]).includes(type)) {
    throw new ContractRejected('COMMAND_TYPE_UNKNOWN', 'type', 'unknown Admin command type');
  }
  const payload = payloadOf(type as AdminCommandType, requiredField(envelope, '', 'payload'));
  return { command_id: commandId, type, payload } as AdminCommand;
}
