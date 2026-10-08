// A04 — stored waiting fields ↔ the S06 domain state (@gm/domain waiting.ts). The request keeps the
// current party and clocks (Part 6 §6.4.1 “รอ”); each interval, with the recipients chosen for it
// (the only people who may answer, A2.1) and its start / response / exit, lives in
// `requests/{id}/waiting_intervals/w{n}` (Part 6 §6.4), read through the API with the detail access.
import type { RequestRecord, WaitingOnDocument } from '@gm/contracts';
import type { EndedWaitingInterval, WaitingOn, WaitingOnInput, WaitingRequestState } from '@gm/domain';
import { REQUESTS_COLLECTION } from './execute-command';
import type { StoredData } from './transaction-port';

export const WAITING_INTERVALS = 'waiting_intervals';

export function intervalPath(requestId: string, intervalId: number): string {
  return `${REQUESTS_COLLECTION}/${requestId}/${WAITING_INTERVALS}/w${String(intervalId).padStart(6, '0')}`;
}

export function waitingOnOf(stored: WaitingOnDocument): WaitingOn {
  switch (stored.kind) {
    case 'person':
      return { kind: 'person', personId: stored.person_id ?? '' };
    case 'team':
      return { kind: 'team', teamLabel: stored.team_label ?? '', contactIds: stored.contact_ids ?? [] };
    default:
      return { kind: stored.kind, name: stored.name ?? '' };
  }
}

export function waitingOnDocument(waitingOn: WaitingOn): WaitingOnDocument {
  switch (waitingOn.kind) {
    case 'person':
      return { kind: 'person', person_id: waitingOn.personId };
    case 'team':
      return { kind: 'team', team_label: waitingOn.teamLabel, contact_ids: waitingOn.contactIds };
    default:
      return { kind: waitingOn.kind, name: waitingOn.name };
  }
}

/** The submitted party (snake_case wire) as the domain input; validation stays in the domain (F3). */
export function waitingOnInput(payload: { readonly kind?: string; readonly person_id?: string; readonly team_label?: string; readonly contact_ids?: readonly string[]; readonly name?: string } | undefined): WaitingOnInput | undefined {
  if (payload === undefined) return undefined;
  return { kind: payload.kind, personId: payload.person_id, teamLabel: payload.team_label, contactIds: payload.contact_ids, name: payload.name };
}

const strings = (value: unknown): readonly string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);

/** The whole request as the S06 state; `interval` is the stored current interval (its recipients). */
export function toWaitingState(record: RequestRecord, interval: StoredData | undefined): WaitingRequestState {
  const optional = <K extends string, V>(key: K, value: V | undefined) => (value === undefined ? {} : ({ [key]: value } as { readonly [P in K]: V }));
  const waiting = record.status === 'waiting' && record.waiting_on !== undefined && record.current_waiting_interval_id !== undefined && record.waiting_since !== undefined;
  return {
    source: record.source,
    status: record.status,
    ...optional('requesterId', record.requester_id),
    ...optional('assigneeId', record.assignee_id),
    lastUpdatedAt: record.last_updated_at,
    completionCycleId: record.completion_cycle_id,
    ...optional('completedAt', record.completed_at),
    ...optional('autoCloseDueAt', record.auto_close_due_at),
    ...optional('closedAt', record.closed_at),
    ...optional('closureKind', record.closure_kind),
    ...optional('cancelledAt', record.cancelled_at),
    isConfidential: record.is_confidential,
    relatedPersonIds: record.related_person_ids,
    ...optional('confidentialGrantIds', record.confidential_grant_ids),
    waitingIntervalSeq: Math.max(record.waiting_interval_seq ?? 0, record.current_waiting_interval_id ?? 0),
    ...optional('lastReminderBusinessDate', record.last_reminder_business_date),
    ...(waiting
      ? {
          waitingOn: waitingOnOf(record.waiting_on!),
          currentWaitingIntervalId: record.current_waiting_interval_id!,
          waitingSince: record.waiting_since!,
          waitingRecipientIds: strings(interval?.recipient_ids),
          waitingPartyResponded: record.waiting_party_responded === true,
          ...optional('respondedAt', record.responded_at),
        }
      : {}),
  };
}

const CURRENT_WAITING_FIELDS = ['waiting_on', 'current_waiting_interval_id', 'waiting_since', 'waiting_party_responded', 'responded_at'] as const;

/** The waiting, access and clock fields of `state` written back over the request; the rest is kept. */
export function withWaitingState(record: RequestRecord, state: WaitingRequestState): RequestRecord {
  const kept = Object.fromEntries(
    Object.entries(record).filter(([key]) => !(CURRENT_WAITING_FIELDS as readonly string[]).includes(key) && key !== 'confidential_grant_ids'),
  ) as unknown as RequestRecord;
  const optional = <K extends string, V>(key: K, value: V | undefined) => (value === undefined ? {} : ({ [key]: value } as { readonly [P in K]: V }));
  return {
    ...kept,
    status: state.status,
    last_updated_at: state.lastUpdatedAt,
    related_person_ids: state.relatedPersonIds,
    ...optional('confidential_grant_ids', state.confidentialGrantIds),
    ...(state.waitingIntervalSeq > 0 ? { waiting_interval_seq: state.waitingIntervalSeq } : {}),
    ...optional('last_reminder_business_date', state.lastReminderBusinessDate),
    ...(state.waitingOn === undefined ? {} : { waiting_on: waitingOnDocument(state.waitingOn) }),
    ...optional('current_waiting_interval_id', state.currentWaitingIntervalId),
    ...optional('waiting_since', state.waitingSince),
    ...optional('waiting_party_responded', state.waitingPartyResponded),
    ...optional('responded_at', state.respondedAt),
  };
}

/** An ended interval as kept in history (snake_case like every stored event). */
export function endedIntervalDocument(ended: EndedWaitingInterval): Record<string, unknown> {
  return {
    interval_id: ended.intervalId,
    waiting_on: waitingOnDocument(ended.waitingOn),
    recipient_ids: ended.recipientIds,
    started_at: ended.startedAt,
    ...(ended.respondedAt === undefined ? {} : { responded_at: ended.respondedAt }),
    exited_at: ended.exitedAt,
  };
}

/** The stored interval closed by resume / change / cancel (its response, if any, is kept). */
export function exitedInterval(stored: StoredData | undefined, ended: EndedWaitingInterval, reason: 'resumed' | 'changed' | 'cancelled'): Record<string, unknown> {
  return {
    interval_id: ended.intervalId,
    waiting_on: waitingOnDocument(ended.waitingOn),
    recipient_ids: ended.recipientIds,
    started_at: ended.startedAt,
    ...stored,
    exited_at: ended.exitedAt,
    exit_reason: reason,
  };
}
