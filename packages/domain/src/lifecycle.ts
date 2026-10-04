// Lifecycle commands (S05): accept, complete, confirm, not resolved, auto-close, cancel, reopen
// (F04, F06, PRD §6.5, US-08/09, C2, C5, Part 6 §6.6/§6.9). Pure: callers pass `now` and the
// calendar snapshot; persistence, revision checks and notifications are elsewhere.
// Waiting / follow-up / waiting-party response belong to S06; assignment and leave to S07.
import type { CalendarSnapshot, Instant } from '@gm/time';
import type { Actor } from './request-creation';

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

function notImplemented(name: string): never {
  throw new Error(`${name}: not implemented yet (S05)`);
}

export function acceptRequest<S extends LifecycleState>(
  _state: S, _command: ActorCommand): LifecycleResult<S> {
  return notImplemented('acceptRequest');
}

export function completeRequest<S extends LifecycleState>(
  _state: S,
  _command: ActorCommand & {
    readonly resolutionSummary: string;
    /** Calendar copied for the confirmation window; required when there is a requester (C5). */
    readonly confirmationCalendar?: CalendarSnapshot | undefined;
  },
): LifecycleResult<S> {
  return notImplemented('completeRequest');
}

export function confirmCompletion<S extends LifecycleState>(
  _state: S,
  _command: ActorCommand & { readonly completionCycleId: number },
): LifecycleResult<S> {
  return notImplemented('confirmCompletion');
}

export function reportNotResolved<S extends LifecycleState>(
  _state: S,
  _command: ActorCommand & { readonly completionCycleId: number; readonly reason: string },
): LifecycleResult<S> {
  return notImplemented('reportNotResolved');
}

export function autoCloseRequest<S extends LifecycleState>(
  _state: S,
  _command: { readonly now: Instant; readonly completionCycleId: number },
): AutoCloseResult<S> {
  return notImplemented('autoCloseRequest');
}

export function cancelRequest<S extends LifecycleState>(
  _state: S, _command: ActorCommand & { readonly reason: string }): LifecycleResult<S> {
  return notImplemented('cancelRequest');
}

export function reopenRequest<S extends LifecycleState>(
  _state: S, _command: ActorCommand & { readonly reason: string }): LifecycleResult<S> {
  return notImplemented('reopenRequest');
}
