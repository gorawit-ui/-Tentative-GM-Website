// GM presence and leave (S07: C7, A3, F07, Part 6 §6.4/§6.9; D-S07-1). Pure: callers pass `now`;
// the scheduler persists resets; UI reads `effectivePresence` so yesterday's value never shows.
import { bangkokDateOf, presenceExpiresAt, type Instant } from '@gm/time';
import { reject } from './command-guards';
import { isGm, type Actor, type Labelled } from './request-creation';

/**
 * D-S07-1: presence kinds. A location is not a fixed key: `at_location` points at an entry of the
 * Admin `locations` list, so a location added later can be chosen at once.
 */
export const PRESENCE_KINDS = ['at_location', 'off_site', 'on_leave', 'unspecified'] as const;
export type PresenceKind = (typeof PRESENCE_KINDS)[number];

/** `presence_status` (persisted as `{ kind, location_id }`). */
export type PresenceStatus =
  | { readonly kind: 'at_location'; readonly locationId: string }
  | { readonly kind: Exclude<PresenceKind, 'at_location'> };

/** Thai labels of the kinds without a location; `at_location` shows “อยู่ <ชื่อสถานที่>”. */
export const PRESENCE_KIND_LABELS = {
  off_site: 'ออกนอกสถานที่',
  on_leave: 'ลา',
  unspecified: 'ไม่ระบุ',
} as const satisfies Record<Exclude<PresenceKind, 'at_location'>, string>;

const UNSPECIFIED: PresenceStatus = { kind: 'unspecified' };

/** `gm_profiles/{person_id}` (Part 6 §6.4). */
export interface GmProfile {
  readonly personId: string;
  readonly presenceStatus: PresenceStatus;
  readonly presenceUpdatedAt?: Instant;
  /** `leave_ends_on` (Bangkok date, inclusive); only with `on_leave`. */
  readonly leaveEndsOn?: string;
  readonly focusRequestId?: string;
}

export interface EffectivePresence {
  readonly status: PresenceStatus;
  /** When it was set (shown next to the status); absent for “ไม่ระบุ”. */
  readonly setAt?: Instant;
  readonly leaveEndsOn?: string;
  readonly expiresAt?: Instant;
}

export interface PresenceChangedEvent {
  readonly kind: 'presence_changed';
  readonly at: Instant;
  readonly actorId: string;
  readonly personId: string;
  readonly status: PresenceStatus;
  readonly leaveEndsOn?: string;
}

export type PresenceResetResult<P extends GmProfile> =
  | { readonly applied: true; readonly profile: P }
  | { readonly applied: false; readonly profile: P; readonly skipReason: 'already_unspecified' | 'not_expired' };

/**
 * Display text, built from the current location name (a rename shows at once). `locations` is the
 * Admin list; a stored location missing from it is a caller error (pass every location).
 */
export function presenceLabel(status: PresenceStatus, locations: readonly Labelled[]): string {
  if (status.kind !== 'at_location') return PRESENCE_KIND_LABELS[status.kind];
  const location = locations.find((candidate) => candidate.id === status.locationId);
  if (location === undefined) throw new Error('presence location is not in the locations list passed in');
  return `อยู่ ${location.label}`;
}

/** Part 6 §6.6 setFocus/setPresence: the GM who owns the profile, or GM Admin. */
export function requireProfileOwner(actor: Actor, profile: GmProfile): void {
  const owner = isGm(actor) && actor.personId === profile.personId;
  if (!owner && actor.role !== 'gm_admin') reject('PROFILE_OWNER_ONLY', 'Only the GM or GM Admin can change this profile');
}

function validLeaveEnd(leaveEndsOn: string, now: Instant): string {
  try {
    // Epoch 0 is before any accepted date, so this only checks that the date itself is real.
    presenceExpiresAt(0, leaveEndsOn);
  } catch {
    reject('LEAVE_END_INVALID', 'leave end date must be a real Gregorian YYYY-MM-DD date');
  }
  if (leaveEndsOn < bangkokDateOf(now)) reject('LEAVE_END_IN_PAST', 'leave end date must not be before today (A3)');
  return leaveEndsOn;
}

function withoutPresenceDetails<P extends GmProfile>(profile: P): P {
  const { presenceUpdatedAt: _setAt, leaveEndsOn: _leaveEndsOn, ...rest } = profile;
  return rest as P;
}

function validPresence(
  presence: { readonly kind: string; readonly locationId?: string | undefined },
  locations: readonly Labelled[],
): PresenceStatus {
  const { kind, locationId } = presence;
  if (!(PRESENCE_KINDS as readonly string[]).includes(kind)) reject('PRESENCE_INVALID', 'Unknown presence kind');
  if (kind !== 'at_location') {
    if (locationId !== undefined) reject('PRESENCE_LOCATION_NOT_APPLICABLE', 'Only at_location carries a location');
    return { kind: kind as Exclude<PresenceKind, 'at_location'> };
  }
  if (locationId === undefined || locationId === '') reject('PRESENCE_LOCATION_REQUIRED', 'Choose a location');
  if (!locations.some((location) => location.id === locationId)) {
    reject('PRESENCE_LOCATION_UNKNOWN', 'The location is not in the locations list');
  }
  return { kind: 'at_location', locationId };
}

/** GM sets presence; leave may carry an inclusive end date (A3). Focus is untouched (F07). */
export function setPresence<P extends GmProfile>(
  profile: P,
  command: {
    readonly actor: Actor;
    readonly now: Instant;
    readonly presence: { readonly kind: string; readonly locationId?: string | undefined };
    /** The current Admin locations list (D-S07-1). */
    readonly locations: readonly Labelled[];
    readonly leaveEndsOn?: string | undefined;
  },
): { readonly profile: P; readonly event: PresenceChangedEvent } {
  requireProfileOwner(command.actor, profile);
  const status = validPresence(command.presence, command.locations);
  if (command.leaveEndsOn !== undefined && status.kind !== 'on_leave') {
    reject('LEAVE_END_NOT_APPLICABLE', 'Only leave has an end date');
  }
  const leaveEndsOn = command.leaveEndsOn === undefined ? undefined : validLeaveEnd(command.leaveEndsOn, command.now);
  const leave = leaveEndsOn === undefined ? {} : { leaveEndsOn };
  return {
    profile: { ...withoutPresenceDetails(profile), presenceStatus: status, presenceUpdatedAt: command.now, ...leave },
    event: {
      kind: 'presence_changed',
      at: command.now,
      actorId: command.actor.personId,
      personId: profile.personId,
      status,
      ...leave,
    },
  };
}

/** What to show now: expired values read as “ไม่ระบุ” even before the reset job (Part 6 §6.9). */
export function effectivePresence(profile: GmProfile, now: Instant): EffectivePresence {
  const { presenceStatus: status, presenceUpdatedAt: setAt } = profile;
  if (status.kind === 'unspecified' || setAt === undefined) return { status: UNSPECIFIED };
  const leaveEndsOn = status.kind === 'on_leave' ? profile.leaveEndsOn : undefined;
  const expiresAt = presenceExpiresAt(setAt, leaveEndsOn);
  if (now >= expiresAt) return { status: UNSPECIFIED };
  return { status, setAt, ...(leaveEndsOn === undefined ? {} : { leaveEndsOn }), expiresAt };
}

/** Effective leave at `now`; a missing profile is not on leave. */
export function isOnLeave(profile: GmProfile | undefined, now: Instant): boolean {
  return profile !== undefined && effectivePresence(profile, now).status.kind === 'on_leave';
}

/** Scheduler reset: rechecks the latest profile, so a value set for the new day is kept. */
export function resetPresence<P extends GmProfile>(profile: P, now: Instant): PresenceResetResult<P> {
  if (profile.presenceStatus.kind === 'unspecified') return { applied: false, profile, skipReason: 'already_unspecified' };
  if (effectivePresence(profile, now).status.kind !== 'unspecified') return { applied: false, profile, skipReason: 'not_expired' };
  return { applied: true, profile: { ...withoutPresenceDetails(profile), presenceStatus: UNSPECIFIED } };
}
