// Lifecycle commands (S05): accept, complete, confirm, not resolved, auto-close, cancel, reopen
// (F04, F06, PRD §6.5, US-08/09, C2, C5, Part 6 §6.6/§6.9). Pure: callers pass `now` and the
// calendar snapshot; persistence, revision checks and notifications are elsewhere.
// Waiting / follow-up / waiting-party response belong to S06; assignment and leave to S07.
import { autoCloseDue, type CalendarSnapshot, type Instant } from '@gm/time';
import { isGm, type Actor } from './request-creation';

export const REQUEST_STATUSES = ['queued', 'in_progress', 'waiting', 'completed', 'cancelled'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** How a completed request was closed; history keeps them apart (F06). */
export type ClosureKind = 'requester_confirmed' | 'auto_closed' | 'gm_closed';

export interface LifecycleState {
  readonly source: 'web' | 'trello';
  readonly status: RequestStatus;
  /** Present only for a real requester account; decides whether completion needs confirmation (F06). */
  readonly requesterId?: string;
  readonly assigneeId?: string;
  /** GM progress clock used for stale (Part 6 §6.4.1). */
  readonly lastUpdatedAt: Instant;
  /** Completion round (`completion_cycle_id`); 0 before the first completion, never reset. */
  readonly completionCycleId: number;
  readonly completedAt?: Instant;
  /** Calendar copied when the confirmation wait starts (Part 6 §6.7). */
  readonly confirmationCalendarSnapshot?: CalendarSnapshot;
  readonly autoCloseDueAt?: Instant;
  readonly closedAt?: Instant;
  readonly closureKind?: ClosureKind;
  readonly cancelledAt?: Instant;
}

export type LifecycleEventKind =
  | 'accepted'
  | 'completed'
  | 'closed'
  | 'not_resolved'
  | 'cancelled'
  | 'reopened';

/** History entry produced by a command (the caller persists it). */
export interface LifecycleEvent {
  readonly kind: LifecycleEventKind;
  readonly at: Instant;
  /** Person ID, or 'system' for the auto-close tick. */
  readonly actorId: string;
  readonly completionCycleId?: number;
  readonly closureKind?: ClosureKind;
  readonly reason?: string;
  readonly resolutionSummary?: string;
  /** Accept that took the request over from another GM (D-S05-5). */
  readonly previousAssigneeId?: string;
}

/** Commands return the whole request with only lifecycle fields changed, so history-adjacent
 * fields such as `sla_breached_at` survive cancel/reopen (US-09). */
export interface LifecycleResult<S extends LifecycleState = LifecycleState> {
  readonly state: S;
  readonly event: LifecycleEvent;
}

export type AutoCloseSkipReason =
  | 'read_only_source'
  | 'not_completed'
  | 'already_closed'
  | 'stale_completion_cycle'
  | 'not_due';

export type AutoCloseResult<S extends LifecycleState = LifecycleState> =
  | { readonly applied: true; readonly state: S; readonly event: LifecycleEvent }
  | { readonly applied: false; readonly state: S; readonly skipReason: AutoCloseSkipReason };

export class LifecycleRejected extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'LifecycleRejected';
    this.code = code;
  }
}

export interface ActorCommand {
  readonly actor: Actor;
  readonly now: Instant;
}

/** Fields that belong to one completion or cancellation and are cleared when the request moves on. */
type RoundField =
  | 'completedAt'
  | 'confirmationCalendarSnapshot'
  | 'autoCloseDueAt'
  | 'closedAt'
  | 'closureKind'
  | 'cancelledAt';

/** Copy of `state` without the given round fields (absent, never `undefined`); history keeps the old values. */
function without<S extends LifecycleState>(state: S, fields: readonly RoundField[]): S {
  const dropped: readonly string[] = fields;
  return Object.fromEntries(Object.entries(state).filter(([key]) => !dropped.includes(key))) as S;
}

const CURRENT_ROUND: readonly RoundField[] = [
  'completedAt',
  'confirmationCalendarSnapshot',
  'autoCloseDueAt',
  'closedAt',
  'closureKind',
  'cancelledAt',
];

function reject(code: string, message: string): never {
  throw new LifecycleRejected(code, message);
}

function requireWritable(state: LifecycleState): void {
  if (state.source === 'trello') reject('READ_ONLY_SOURCE', 'Trello cards are read-only on the web (F04)');
}

function requireGmActor(actor: Actor): void {
  if (!isGm(actor)) reject('GM_ONLY', 'Only GM staff or GM Admin can run this command');
}

function requireStatus(state: LifecycleState, allowed: readonly RequestStatus[], command: string): void {
  if (!allowed.includes(state.status)) reject('INVALID_TRANSITION', `${command} is not allowed from ${state.status}`);
}

function requireReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed === '') reject('REASON_REQUIRED', 'A reason is required');
  return trimmed;
}

/** Requester answers (F06): only the real requester, on the current, still-open completion cycle. */
function requireOpenConfirmation(state: LifecycleState, actor: Actor, completionCycleId: number): void {
  requireWritable(state);
  if (state.requesterId === undefined || actor.personId !== state.requesterId) {
    reject('REQUESTER_ONLY', 'Only the requester can confirm or report not resolved');
  }
  if (state.status !== 'completed') reject('NOT_AWAITING_CONFIRMATION', 'The request is not awaiting confirmation');
  if (state.closedAt !== undefined) reject('ALREADY_CLOSED', 'The request is already closed');
  if (completionCycleId !== state.completionCycleId) {
    reject('STALE_COMPLETION_CYCLE', 'The answer refers to an earlier completion');
  }
}

export function acceptRequest<S extends LifecycleState>(
  state: S,
  command: ActorCommand & {
    /** D-S05-5: explicit confirmation to take over a request assigned to another GM. */
    readonly takeOver?: boolean | undefined;
  },
): LifecycleResult<S> {
  requireWritable(state);
  requireGmActor(command.actor);
  requireStatus(state, ['queued'], 'accept');
  return {
    state: { ...state, status: 'in_progress', assigneeId: command.actor.personId, lastUpdatedAt: command.now },
    event: { kind: 'accepted', at: command.now, actorId: command.actor.personId },
  };
}

/**
 * GM records the result and completes (F06). With a requester the request waits for confirmation
 * until `autoCloseDue`; without one (gm_task, text-name on-behalf) it closes at once.
 */
export function completeRequest<S extends LifecycleState>(
  state: S,
  command: ActorCommand & {
    readonly resolutionSummary: string;
    /** Calendar copied for the confirmation window; required when there is a requester (C5). */
    readonly confirmationCalendar?: CalendarSnapshot | undefined;
  },
): LifecycleResult<S> {
  requireWritable(state);
  requireGmActor(command.actor);
  requireStatus(state, ['in_progress'], 'complete');
  const resolutionSummary = command.resolutionSummary.trim();
  if (resolutionSummary === '') reject('RESULT_SUMMARY_REQUIRED', 'A result summary is required to complete');
  const { now } = command;
  const completionCycleId = state.completionCycleId + 1;
  const base = {
    ...without(state, CURRENT_ROUND),
    status: 'completed' as const,
    completionCycleId,
    completedAt: now,
    lastUpdatedAt: now,
  };
  const event = { kind: 'completed' as const, at: now, actorId: command.actor.personId, completionCycleId };

  if (state.requesterId === undefined) {
    return {
      state: { ...base, closedAt: now, closureKind: 'gm_closed' },
      event: { ...event, closureKind: 'gm_closed', resolutionSummary },
    };
  }
  const calendar = command.confirmationCalendar;
  if (calendar === undefined) {
    reject('CONFIRMATION_CALENDAR_REQUIRED', 'A request with a requester needs the confirmation calendar');
  }
  return {
    state: { ...base, confirmationCalendarSnapshot: calendar, autoCloseDueAt: autoCloseDue(now, calendar) },
    event: { ...event, resolutionSummary },
  };
}

/** Requester confirms the current completion: closed by the requester, due date kept. */
export function confirmCompletion<S extends LifecycleState>(
  state: S,
  command: ActorCommand & { readonly completionCycleId: number },
): LifecycleResult<S> {
  requireOpenConfirmation(state, command.actor, command.completionCycleId);
  return {
    state: { ...state, closedAt: command.now, closureKind: 'requester_confirmed' },
    event: {
      kind: 'closed',
      at: command.now,
      actorId: command.actor.personId,
      completionCycleId: state.completionCycleId,
      closureKind: 'requester_confirmed',
    },
  };
}

/** Requester says it is not resolved: back to in_progress, the cycle's due date no longer applies. */
export function reportNotResolved<S extends LifecycleState>(
  state: S,
  command: ActorCommand & { readonly completionCycleId: number; readonly reason: string },
): LifecycleResult<S> {
  requireOpenConfirmation(state, command.actor, command.completionCycleId);
  const reason = requireReason(command.reason);
  return {
    state: { ...without(state, CURRENT_ROUND), status: 'in_progress' },
    event: {
      kind: 'not_resolved',
      at: command.now,
      actorId: command.actor.personId,
      completionCycleId: state.completionCycleId,
      reason,
    },
  };
}

/**
 * Scheduler auto-close (Part 6 §6.9): rechecks the latest state and skips, never throws, when the job
 * is obsolete. `closedAt` is the real close time; the original due is kept; `lastUpdatedAt` untouched.
 */
export function autoCloseRequest<S extends LifecycleState>(
  state: S,
  command: { readonly now: Instant; readonly completionCycleId: number },
): AutoCloseResult<S> {
  const skip = (skipReason: AutoCloseSkipReason): AutoCloseResult<S> => ({ applied: false, state, skipReason });
  if (state.source === 'trello') return skip('read_only_source');
  if (state.status !== 'completed') return skip('not_completed');
  if (state.closedAt !== undefined) return skip('already_closed');
  if (command.completionCycleId !== state.completionCycleId) return skip('stale_completion_cycle');
  if (state.autoCloseDueAt === undefined || command.now < state.autoCloseDueAt) return skip('not_due');
  return {
    applied: true,
    state: { ...state, closedAt: command.now, closureKind: 'auto_closed' },
    event: {
      kind: 'closed',
      at: command.now,
      actorId: 'system',
      completionCycleId: state.completionCycleId,
      closureKind: 'auto_closed',
    },
  };
}

export function cancelRequest<S extends LifecycleState>(
  state: S,
  command: ActorCommand & { readonly reason: string },
): LifecycleResult<S> {
  requireWritable(state);
  requireGmActor(command.actor);
  requireStatus(state, ['queued', 'in_progress', 'waiting'], 'cancel');
  const reason = requireReason(command.reason);
  return {
    state: { ...state, status: 'cancelled', cancelledAt: command.now, lastUpdatedAt: command.now },
    event: { kind: 'cancelled', at: command.now, actorId: command.actor.personId, reason },
  };
}

/** GM reopens: completed → in_progress, cancelled → queued. Earlier rounds stay in history. */
export function reopenRequest<S extends LifecycleState>(
  state: S,
  command: ActorCommand & { readonly reason: string },
): LifecycleResult<S> {
  requireWritable(state);
  requireGmActor(command.actor);
  requireStatus(state, ['completed', 'cancelled'], 'reopen');
  const reason = requireReason(command.reason);
  const event = { kind: 'reopened' as const, at: command.now, actorId: command.actor.personId, reason };
  const reopened = { ...without(state, CURRENT_ROUND), lastUpdatedAt: command.now };
  if (state.status === 'cancelled') return { state: { ...reopened, status: 'queued' }, event };
  return {
    state: { ...reopened, status: 'in_progress' },
    event: { ...event, completionCycleId: state.completionCycleId },
  };
}
