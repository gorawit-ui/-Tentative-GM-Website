// GM presence and leave (S07: C7, A3, F07, Part 6 §6.4/§6.9). Pure: callers pass `now`; the
// scheduler persists resets; UI reads `effectivePresence` so yesterday's value never shows.
import { bangkokDateOf, presenceExpiresAt, type Instant } from '@gm/time';
import { reject } from './command-guards';
import { isGm, type Actor } from './request-creation';

/** C7 presence values: stable keys stored, Thai labels displayed (same pattern as D-S04-1). */
export const PRESENCE_LABELS = {
  at_wh300: 'อยู่ WH300',
  at_fac16: 'อยู่ FAC16',
  at_fac17: 'อยู่ FAC17',
  at_office_195: 'อยู่ Office 195',
  at_cafe_222: 'อยู่ Cafe 222',
  off_site: 'ออกนอกสถานที่',
  on_leave: 'ลา',
  unspecified: 'ไม่ระบุ',
} as const;
export type PresenceStatus = keyof typeof PRESENCE_LABELS;
export const PRESENCE_STATUSES = Object.keys(PRESENCE_LABELS) as readonly PresenceStatus[];

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

/** GM sets presence; leave may carry an inclusive end date (A3). Focus is untouched (F07). */
export function setPresence<P extends GmProfile>(
  profile: P,
  command: {
    readonly actor: Actor;
    readonly now: Instant;
    readonly status: string;
    readonly leaveEndsOn?: string | undefined;
  },
): { readonly profile: P; readonly event: PresenceChangedEvent } {
  requireProfileOwner(command.actor, profile);
  if (!Object.hasOwn(PRESENCE_LABELS, command.status)) reject('PRESENCE_INVALID', 'Unknown presence status');
  const status = command.status as PresenceStatus;
  if (command.leaveEndsOn !== undefined && status !== 'on_leave') {
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
  if (status === 'unspecified' || setAt === undefined) return { status: 'unspecified' };
  const leaveEndsOn = status === 'on_leave' ? profile.leaveEndsOn : undefined;
  const expiresAt = presenceExpiresAt(setAt, leaveEndsOn);
  if (now >= expiresAt) return { status: 'unspecified' };
  return { status, setAt, ...(leaveEndsOn === undefined ? {} : { leaveEndsOn }), expiresAt };
}

/** Effective leave at `now`; a missing profile is not on leave. */
export function isOnLeave(profile: GmProfile | undefined, now: Instant): boolean {
  return profile !== undefined && effectivePresence(profile, now).status === 'on_leave';
}

/** Scheduler reset: rechecks the latest profile, so a value set for the new day is kept. */
export function resetPresence<P extends GmProfile>(profile: P, now: Instant): PresenceResetResult<P> {
  if (profile.presenceStatus === 'unspecified') return { applied: false, profile, skipReason: 'already_unspecified' };
  if (effectivePresence(profile, now).status !== 'unspecified') return { applied: false, profile, skipReason: 'not_expired' };
  return { applied: true, profile: { ...withoutPresenceDetails(profile), presenceStatus: 'unspecified' } };
}
