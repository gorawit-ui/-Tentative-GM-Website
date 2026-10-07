// Waiting on others (S06): enter / change party, follow up (+ reminder quota), waiting-party
// response and resume (F04, F05, C3, C4, A2, F3, Part 6 §6.6/§6.14). Pure: callers pass `now`,
// the request's work calendar and persist state, history events and outbox items. Nothing is sent here.
import { businessDateBucket, nextWorkingMorning, type CalendarSnapshot, type Instant } from '@gm/time';
import { reject, requireGmActor, requireStatus, requireWritable } from './command-guards';
import type { LifecycleState } from './lifecycle';
import { isGm, type Actor } from './request-creation';

export const WAITING_PARTY_KINDS = ['person', 'team', 'contractor', 'government', 'other'] as const;
export type WaitingPartyKind = (typeof WAITING_PARTY_KINDS)[number];
export type ExternalPartyKind = 'contractor' | 'government' | 'other';

/** Max internal contacts chosen for a team (F05 §9.1). */
export const MAX_TEAM_CONTACTS = 3;

/** D-S06-2 default for notices deferred from a closed day; overridable in settings. */
export const DEFAULT_WORKING_MORNING_TIME = '09:00';

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
  /** D-S09-2: people added to a confidential request with the separate grant confirmed (C3). */
  readonly confidentialGrantIds?: readonly string[];
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
  /** Current GM Staff/Admin person IDs: they already have access (D-S06-4). */
  readonly gmPersonIds?: readonly string[] | undefined;
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
  | {
      readonly status: 'next_business_day';
      readonly businessDate: string;
      /** D-S06-2: `nextWorkingMorning` at the configured time (09:00 Asia/Bangkok by default). */
      readonly sendAt: Instant;
      readonly recipientIds: readonly string[];
    }
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

const EXTERNAL_KINDS: readonly string[] = ['contractor', 'government', 'other'];

/** Current-interval fields, cleared when the interval ends; history keeps them in the event. */
const CURRENT_INTERVAL_FIELDS = [
  'waitingOn',
  'currentWaitingIntervalId',
  'waitingSince',
  'waitingRecipientIds',
  'waitingPartyResponded',
  'respondedAt',
] as const;

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function rejectForeignFields(input: WaitingOnInput, allowed: readonly (keyof WaitingOnInput)[]): void {
  const fields: readonly (keyof WaitingOnInput)[] = ['personId', 'teamLabel', 'contactIds', 'name'];
  const foreign = fields.filter((field) => !allowed.includes(field) && input[field] !== undefined);
  if (foreign.length > 0) reject('WAITING_ON_INVALID', `waiting_on.${foreign.join(', ')} does not belong to this kind`);
}

/** F3/C3: the party is explicit, with exactly the data of its kind; no default is ever chosen. */
function validateWaitingOn(input: WaitingOnInput | undefined): WaitingOn {
  const kind = text(input?.kind);
  if (input === undefined || kind === undefined) reject('WAITING_ON_REQUIRED', 'Choose who the request is waiting on');
  switch (kind) {
    case 'person': {
      rejectForeignFields(input, ['personId']);
      const personId = text(input.personId) ?? reject('WAITING_PERSON_REQUIRED', 'Choose the person to wait on');
      return { kind, personId };
    }
    case 'team': {
      rejectForeignFields(input, ['teamLabel', 'contactIds']);
      const teamLabel = text(input.teamLabel) ?? reject('WAITING_TEAM_LABEL_REQUIRED', 'Name the team to wait on');
      const contactIds = (input.contactIds ?? []).map(
        (id) => text(id) ?? reject('WAITING_CONTACT_INVALID', 'Team contacts must be people'),
      );
      if (contactIds.length > MAX_TEAM_CONTACTS) {
        reject('WAITING_CONTACTS_TOO_MANY', `Choose at most ${MAX_TEAM_CONTACTS} team contacts`);
      }
      if (new Set(contactIds).size !== contactIds.length) reject('WAITING_CONTACTS_DUPLICATE', 'Team contacts must differ');
      return { kind, teamLabel, contactIds };
    }
    case 'contractor':
    case 'government':
    case 'other': {
      rejectForeignFields(input, ['name']);
      const name = text(input.name) ?? reject('WAITING_NAME_REQUIRED', 'Name the party to wait on');
      return { kind, name };
    }
    default:
      return reject('WAITING_KIND_INVALID', 'waiting_on.kind must be person, team, contractor, government or other');
  }
}

/** F05 §9.1: who gets the notice for this interval. */
function recipientsOf(waitingOn: WaitingOn, notify: boolean | undefined): readonly string[] {
  const candidates =
    waitingOn.kind === 'person' ? [waitingOn.personId] : waitingOn.kind === 'team' ? waitingOn.contactIds : [];
  if (candidates.length === 0) {
    if (notify === true) reject('NOTIFY_NOT_AVAILABLE', 'Nobody can be notified for this party');
    return [];
  }
  return notify === false ? [] : candidates;
}

/** D-S08-2: nobody is notified about their own action. */
function withoutActor(recipientIds: readonly string[], actorId: string): readonly string[] {
  return recipientIds.filter((personId) => personId !== actorId);
}

function hasDetailAccess(state: WaitingRequestState, personId: string): boolean {
  return state.requesterId === personId || state.relatedPersonIds.includes(personId);
}

/** Preview for the confirm sheet (F05 §9.2): party, recipients, new related persons, consent needed. */
export function planWaiting(
  state: WaitingRequestState,
  input: Pick<WaitingCommand, 'waitingOn' | 'notify' | 'gmPersonIds'>,
): WaitingPlan {
  const waitingOn = validateWaitingOn(input.waitingOn);
  const recipientIds = recipientsOf(waitingOn, input.notify);
  // D-S06-4: GM Staff/Admin already have access; they are notified but never added or consented.
  const gmPersonIds = input.gmPersonIds ?? [];
  const newRelatedPersonIds = recipientIds.filter(
    (personId) => !hasDetailAccess(state, personId) && !gmPersonIds.includes(personId),
  );
  return {
    waitingOn,
    recipientIds,
    newRelatedPersonIds,
    needsConfidentialGrant: state.isConfidential && newRelatedPersonIds.length > 0,
  };
}

function without<S>(state: S, fields: readonly string[]): S {
  return Object.fromEntries(Object.entries(state as object).filter(([key]) => !fields.includes(key))) as S;
}

/** Ends the open interval (exit = `now`) and clears the current waiting fields; used by resume and cancel. */
export function endWaitingInterval<S extends LifecycleState & Partial<WaitingFields>>(
  state: S,
  now: Instant,
): { readonly state: S; readonly endedInterval?: EndedWaitingInterval } {
  const { currentWaitingIntervalId: intervalId, waitingOn, waitingSince: startedAt, respondedAt } = state;
  if (intervalId === undefined || waitingOn === undefined || startedAt === undefined) return { state };
  return {
    state: without(state, CURRENT_INTERVAL_FIELDS),
    endedInterval: {
      intervalId,
      waitingOn,
      recipientIds: state.waitingRecipientIds ?? [],
      startedAt,
      ...(respondedAt === undefined ? {} : { respondedAt }),
      exitedAt: now,
    },
  };
}

function openInterval<S extends WaitingRequestState>(
  state: S,
  command: WaitingCommand,
  endedInterval: EndedWaitingInterval | undefined,
): EnterWaitingResult<S> {
  const plan = planWaiting(state, command);
  if (plan.needsConfidentialGrant && command.confirmConfidentialGrant !== true) {
    reject('CONFIDENTIAL_GRANT_REQUIRED', 'Confirm separately that the new people may read this confidential request');
  }
  const { now } = command;
  const intervalId = state.waitingIntervalSeq + 1;
  // D-S08-2: the GM who acts stays a recipient (may answer) but is not notified.
  const noticeRecipients = withoutActor(plan.recipientIds, command.actor.personId);
  const next = {
    ...without(state, CURRENT_INTERVAL_FIELDS),
    status: 'waiting' as const,
    relatedPersonIds: [...state.relatedPersonIds, ...plan.newRelatedPersonIds],
    waitingIntervalSeq: intervalId,
    waitingOn: plan.waitingOn,
    currentWaitingIntervalId: intervalId,
    waitingSince: now,
    waitingRecipientIds: plan.recipientIds,
    waitingPartyResponded: false,
    lastUpdatedAt: now,
  };
  return {
    state: next,
    event: {
      kind: 'waiting_started',
      at: now,
      actorId: command.actor.personId,
      intervalId,
      waitingOn: plan.waitingOn,
      recipientIds: plan.recipientIds,
      addedRelatedPersonIds: plan.newRelatedPersonIds,
      ...(endedInterval === undefined ? {} : { endedInterval }),
    },
    ...(noticeRecipients.length === 0 ? {} : { notice: { intervalId, recipientIds: noticeRecipients } }),
  };
}

/** GM puts an in-progress request on waiting (F04, F05). */
export function enterWaiting<S extends WaitingRequestState>(state: S, command: WaitingCommand): EnterWaitingResult<S> {
  requireWritable(state);
  requireGmActor(command.actor);
  requireStatus(state, ['in_progress'], 'enterWaiting');
  return openInterval(state, command, undefined);
}

/** GM switches the waited party A → B: A's interval ends now, B's opens; history is not reset (F05 §9.3). */
export function changeWaitingParty<S extends WaitingRequestState>(state: S, command: WaitingCommand): EnterWaitingResult<S> {
  requireWritable(state);
  requireGmActor(command.actor);
  requireStatus(state, ['waiting'], 'changeWaitingParty');
  const ended = endWaitingInterval(state, command.now);
  return openInterval(ended.state, command, ended.endedInterval);
}

function requireOpenInterval(state: WaitingRequestState): number {
  const intervalId = state.currentWaitingIntervalId;
  if (intervalId === undefined) return reject('NOT_WAITING', 'The request has no open waiting interval');
  return intervalId;
}

/**
 * “ติดตามแล้ว” (F05 §9.4): GM progress — history + `last_updated_at`. An optional reminder is limited
 * to one per business day per request; on a closed day it goes to the next business day's quota.
 */
export function followUp<S extends WaitingRequestState>(
  state: S,
  command: {
    readonly actor: Actor;
    readonly now: Instant;
    readonly remind?: boolean | undefined;
    /** The request's work calendar, for the business-date bucket. */
    readonly calendar: CalendarSnapshot;
    /** Settings: local send time for reminders deferred from a closed day (D-S06-2). */
    readonly workingMorningTime?: string | undefined;
  },
): FollowUpResult<S> {
  requireWritable(state);
  requireGmActor(command.actor);
  requireStatus(state, ['waiting'], 'followUp');
  const intervalId = requireOpenInterval(state);
  const { now } = command;
  const base = { kind: 'followed_up' as const, at: now, actorId: command.actor.personId, intervalId };
  const followed = { ...state, lastUpdatedAt: now };
  if (command.remind !== true) return { state: followed, event: base };

  const recipientIds = withoutActor(state.waitingRecipientIds ?? [], command.actor.personId);
  if (recipientIds.length === 0) reject('REMINDER_NO_RECIPIENTS', 'Nobody else was notified for this waiting party');
  const { businessDate, isOpenDay } = businessDateBucket(now, command.calendar);
  if (state.lastReminderBusinessDate === businessDate) {
    const reminder: ReminderOutcome = { status: 'quota_used', businessDate };
    return { state: followed, event: { ...base, reminder }, reminder };
  }
  const reminder: ReminderOutcome = isOpenDay
    ? { status: 'send_now', businessDate, recipientIds }
    : {
        status: 'next_business_day',
        businessDate,
        // On a closed day the bucket is the next open day, which is also the next working morning.
        sendAt: nextWorkingMorning(now, command.calendar, command.workingMorningTime ?? DEFAULT_WORKING_MORNING_TIME),
        recipientIds,
      };
  return {
    state: { ...followed, lastReminderBusinessDate: businessDate },
    event: { ...base, reminder, ...(isOpenDay ? { remindedAt: now } : {}) },
    reminder,
  };
}

/**
 * “ฝั่งฉันเรียบร้อยแล้ว” (A2): only a notified recipient of the current interval who still has access;
 * the first answer counts for a team. No status, waiting or `last_updated_at` change.
 */
export function respondWaitingParty<S extends WaitingRequestState>(
  state: S,
  command: {
    readonly actor: Actor;
    readonly now: Instant;
    readonly intervalId: number;
    readonly note?: string | undefined;
  },
): WaitingResult<S> {
  requireWritable(state);
  if (state.status !== 'waiting') reject('NOT_WAITING', 'The request is not waiting');
  const intervalId = requireOpenInterval(state);
  if (command.intervalId !== intervalId) reject('STALE_WAITING_INTERVAL', 'The response refers to an earlier waiting interval');
  const kind = state.waitingOn?.kind;
  if (kind === undefined || EXTERNAL_KINDS.includes(kind)) {
    reject('NO_RESPONSE_FOR_PARTY', 'External parties do not respond in the app; GM resumes the work');
  }
  const { personId } = command.actor;
  if (!(state.waitingRecipientIds ?? []).includes(personId)) {
    reject('NOT_CURRENT_RECIPIENT', 'Only a notified recipient of the current waiting interval can respond');
  }
  if (!isGm(command.actor) && !hasDetailAccess(state, personId)) reject('ACCESS_REVOKED', 'The recipient no longer has access to this request');
  if (state.waitingPartyResponded === true) reject('ALREADY_RESPONDED', 'The waited party has already responded');
  const note = text(command.note);
  return {
    state: { ...state, waitingPartyResponded: true, respondedAt: command.now },
    event: {
      kind: 'waiting_party_responded',
      at: command.now,
      actorId: personId,
      intervalId,
      ...(note === undefined ? {} : { note }),
    },
  };
}

/** “กลับมาทำต่อ”: GM moves waiting → in_progress and the interval ends (exit = now). */
export function resumeWork<S extends WaitingRequestState>(
  state: S,
  command: { readonly actor: Actor; readonly now: Instant },
): WaitingResult<S> {
  requireWritable(state);
  requireGmActor(command.actor);
  requireStatus(state, ['waiting'], 'resumeWork');
  requireOpenInterval(state);
  const { state: ended, endedInterval } = endWaitingInterval(state, command.now);
  if (endedInterval === undefined) return reject('NOT_WAITING', 'The request has no open waiting interval');
  return {
    state: { ...ended, status: 'in_progress', lastUpdatedAt: command.now },
    event: { kind: 'waiting_ended', at: command.now, actorId: command.actor.personId, endedInterval },
  };
}

/** The open interval of a waiting request, as a @gm/time `WaitingInterval`. */
export function currentWaitingInterval(
  state: WaitingRequestState,
): { readonly startedAt: Instant; readonly respondedAt?: Instant } | undefined {
  if (state.status !== 'waiting' || state.waitingSince === undefined) return undefined;
  return {
    startedAt: state.waitingSince,
    ...(state.respondedAt === undefined ? {} : { respondedAt: state.respondedAt }),
  };
}
