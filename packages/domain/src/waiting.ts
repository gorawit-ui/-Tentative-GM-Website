// Waiting on others (S06): enter / change party, follow up (+ reminder quota), waiting-party
// response and resume (F04, F05, C3, C4, A2, F3, Part 6 §6.6/§6.14). Pure: callers pass `now`,
// the request's work calendar and persist state, history events and outbox items. Nothing is sent here.
import type { CalendarSnapshot, Instant } from '@gm/time';
import type { LifecycleState } from './lifecycle';
import type { Actor } from './request-creation';

export const WAITING_PARTY_KINDS = ['person', 'team', 'contractor', 'government', 'other'] as const;
export type WaitingPartyKind = (typeof WAITING_PARTY_KINDS)[number];
export type ExternalPartyKind = 'contractor' | 'government' | 'other';

/** Max internal contacts chosen for a team (F05 §9.1). */
export const MAX_TEAM_CONTACTS = 3;

/** Stored `waiting_on` (C3): exactly the fields of its kind. */
export type WaitingOn =
  | { readonly kind: 'person'; readonly personId: string }
  | { readonly kind: 'team'; readonly teamLabel: string; readonly contactIds: readonly string[] }
  | { readonly kind: ExternalPartyKind; readonly name: string };

/** What the GM submitted; validated at save time, not only by a disabled button (F3). */
export interface WaitingOnInput {
  readonly kind?: string | undefined;
  readonly personId?: string | undefined;
  readonly teamLabel?: string | undefined;
  readonly contactIds?: readonly string[] | undefined;
  readonly name?: string | undefined;
}

export interface WaitingFields {
  readonly isConfidential: boolean;
  readonly relatedPersonIds: readonly string[];
  /** Number of waiting intervals ever opened on the request; never reset. */
  readonly waitingIntervalSeq: number;
  readonly waitingOn?: WaitingOn;
  readonly currentWaitingIntervalId?: number;
  readonly waitingSince?: Instant;
  /** Notified recipients of the current interval: the only people who may respond (A2.1). */
  readonly waitingRecipientIds?: readonly string[];
  readonly waitingPartyResponded?: boolean;
  readonly respondedAt?: Instant;
  /** Business-date bucket of the last reminder (1 per business day per request, C3). */
  readonly lastReminderBusinessDate?: string;
}

export type WaitingRequestState = LifecycleState & WaitingFields;

/** A closed waiting interval as kept in history; also a `WaitingInterval` for @gm/time. */
export interface EndedWaitingInterval {
  readonly intervalId: number;
  readonly waitingOn: WaitingOn;
  readonly recipientIds: readonly string[];
  readonly startedAt: Instant;
  readonly respondedAt?: Instant;
  readonly exitedAt: Instant;
}

export interface WaitingPlan {
  readonly waitingOn: WaitingOn;
  /** People notified for this interval (empty for external parties or when GM turned it off). */
  readonly recipientIds: readonly string[];
  /** Recipients who become related persons (shown to the GM before confirming, C3). */
  readonly newRelatedPersonIds: readonly string[];
  /** Confidential request adding new people: needs its own confirmation (C3, F3). */
  readonly needsConfidentialGrant: boolean;
}

export interface WaitingCommand {
  readonly actor: Actor;
  readonly now: Instant;
  readonly waitingOn?: WaitingOnInput | undefined;
  /** Person: on by default; team: on by default when contacts are chosen; external: unavailable. */
  readonly notify?: boolean | undefined;
  /** Separate consent to let new people read a confidential request (C3). */
  readonly confirmConfidentialGrant?: boolean | undefined;
}

export interface WaitingNotice {
  readonly intervalId: number;
  readonly recipientIds: readonly string[];
}

export type WaitingEvent =
  | {
      readonly kind: 'waiting_started';
      readonly at: Instant;
      readonly actorId: string;
      readonly intervalId: number;
      readonly waitingOn: WaitingOn;
      readonly recipientIds: readonly string[];
      readonly addedRelatedPersonIds: readonly string[];
      /** Present when the GM switched from another party (A → B). */
      readonly endedInterval?: EndedWaitingInterval;
    }
  | {
      readonly kind: 'followed_up';
      readonly at: Instant;
      readonly actorId: string;
      readonly intervalId: number;
      readonly reminder?: ReminderOutcome;
      /** `reminded_at` (C3) when a reminder goes out now. */
      readonly remindedAt?: Instant;
    }
  | {
      readonly kind: 'waiting_party_responded';
      readonly at: Instant;
      readonly actorId: string;
      readonly intervalId: number;
      readonly note?: string;
    }
  | {
      readonly kind: 'waiting_ended';
      readonly at: Instant;
      readonly actorId: string;
      readonly endedInterval: EndedWaitingInterval;
    };

export type ReminderOutcome =
  | { readonly status: 'send_now'; readonly businessDate: string; readonly recipientIds: readonly string[] }
  | { readonly status: 'next_business_day'; readonly businessDate: string; readonly recipientIds: readonly string[] }
  | { readonly status: 'quota_used'; readonly businessDate: string };

export interface WaitingResult<S extends WaitingRequestState> {
  readonly state: S;
  readonly event: WaitingEvent;
}

export interface EnterWaitingResult<S extends WaitingRequestState> extends WaitingResult<S> {
  /** First notice for the new interval (separate from the reminder quota); absent when nobody is notified. */
  readonly notice?: WaitingNotice;
}

export interface FollowUpResult<S extends WaitingRequestState> extends WaitingResult<S> {
  readonly reminder?: ReminderOutcome;
}

function notImplemented(name: string): never {
  throw new Error(`${name}: not implemented yet (S06)`);
}

export function planWaiting(
  _state: WaitingRequestState,
  _input: Pick<WaitingCommand, 'waitingOn' | 'notify'>,
): WaitingPlan {
  return notImplemented('planWaiting');
}

export function enterWaiting<S extends WaitingRequestState>(_state: S, _command: WaitingCommand): EnterWaitingResult<S> {
  return notImplemented('enterWaiting');
}

export function changeWaitingParty<S extends WaitingRequestState>(
  _state: S,
  _command: WaitingCommand,
): EnterWaitingResult<S> {
  return notImplemented('changeWaitingParty');
}

export function followUp<S extends WaitingRequestState>(
  _state: S,
  _command: {
    readonly actor: Actor;
    readonly now: Instant;
    readonly remind?: boolean | undefined;
    /** The request's work calendar, for the business-date bucket. */
    readonly calendar: CalendarSnapshot;
  },
): FollowUpResult<S> {
  return notImplemented('followUp');
}

export function respondWaitingParty<S extends WaitingRequestState>(
  _state: S,
  _command: {
    readonly actor: Actor;
    readonly now: Instant;
    readonly intervalId: number;
    readonly note?: string | undefined;
  },
): WaitingResult<S> {
  return notImplemented('respondWaitingParty');
}

export function resumeWork<S extends WaitingRequestState>(
  _state: S,
  _command: { readonly actor: Actor; readonly now: Instant },
): WaitingResult<S> {
  return notImplemented('resumeWork');
}

/** The open interval of a waiting request, as a @gm/time `WaitingInterval`. */
export function currentWaitingInterval(
  _state: WaitingRequestState,
): { readonly startedAt: Instant; readonly respondedAt?: Instant } | undefined {
  return notImplemented('currentWaitingInterval');
}

/** Ends the open interval (exit = `now`) and clears the current waiting fields; used by resume and cancel. */
export function endWaitingInterval<S extends LifecycleState & Partial<WaitingFields>>(
  _state: S,
  _now: Instant,
): { readonly state: S; readonly endedInterval?: EndedWaitingInterval } {
  return notImplemented('endWaitingInterval');
}
