// GM presence and leave (S07: C7, A3, F07, Part 6 §6.4/§6.9). Pure: callers pass `now`; the
// scheduler persists resets; UI reads `effectivePresence` so yesterday's value never shows.
import type { Instant } from '@gm/time';
import type { Actor } from './request-creation';

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

function notImplemented(name: string): never {
  throw new Error(`${name}: not implemented yet (S07)`);
}

export function setPresence<P extends GmProfile>(
  _profile: P,
  _command: {
    readonly actor: Actor;
    readonly now: Instant;
    readonly status: string;
    readonly leaveEndsOn?: string | undefined;
  },
): { readonly profile: P; readonly event: PresenceChangedEvent } {
  return notImplemented('setPresence');
}

export function effectivePresence(_profile: GmProfile, _now: Instant): EffectivePresence {
  return notImplemented('effectivePresence');
}

export function isOnLeave(_profile: GmProfile | undefined, _now: Instant): boolean {
  return notImplemented('isOnLeave');
}

export function resetPresence<P extends GmProfile>(_profile: P, _now: Instant): PresenceResetResult<P> {
  return notImplemented('resetPresence');
}
