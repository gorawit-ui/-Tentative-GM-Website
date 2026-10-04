// Shared guards for commands on an existing request (S05/S06, D-S05). Pure.
import { isGm, type Actor } from './request-creation';

export const REQUEST_STATUSES = ['queued', 'in_progress', 'waiting', 'completed', 'cancelled'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** A command on an existing request was refused; `code` is stable for API/UI mapping. */
export class LifecycleRejected extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'LifecycleRejected';
    this.code = code;
  }
}

export function reject(code: string, message: string): never {
  throw new LifecycleRejected(code, message);
}

export function requireWritable(state: { readonly source: 'web' | 'trello' }): void {
  if (state.source === 'trello') reject('READ_ONLY_SOURCE', 'Trello cards are read-only on the web (F04)');
}

export function requireGmActor(actor: Actor): void {
  if (!isGm(actor)) reject('GM_ONLY', 'Only GM staff or GM Admin can run this command');
}

export function requireStatus(
  state: { readonly status: RequestStatus },
  allowed: readonly RequestStatus[],
  command: string,
): void {
  if (!allowed.includes(state.status)) reject('INVALID_TRANSITION', `${command} is not allowed from ${state.status}`);
}

export function requireReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed === '') reject('REASON_REQUIRED', 'A reason is required');
  return trimmed;
}

