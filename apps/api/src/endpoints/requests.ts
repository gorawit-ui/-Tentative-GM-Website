// S12 — read endpoints over the Admin SDK (bypasses Rules), so every one checks access itself.
import type { RequestDetailDocument } from '@gm/contracts';
import type { ApiDeps } from './deps';

export interface MyRequestCard {
  readonly request_id: string;
  readonly request_number: string;
  readonly summary_title: string;
  readonly status: string;
  readonly relation: 'requester' | 'related' | 'watcher';
  /** True when only the public summary may be shown (watchers, U1). */
  readonly summary_only: boolean;
}

export async function getRequestDetail(_deps: ApiDeps, _idToken: string | undefined, _requestId: string): Promise<RequestDetailDocument & { readonly request_id: string }> {
  throw new Error('NOT_IMPLEMENTED');
}

export async function listHistory(_deps: ApiDeps, _idToken: string | undefined, _requestId: string, _limit?: number): Promise<readonly Record<string, unknown>[]> {
  throw new Error('NOT_IMPLEMENTED');
}

export async function listComments(_deps: ApiDeps, _idToken: string | undefined, _requestId: string, _limit?: number): Promise<readonly Record<string, unknown>[]> {
  throw new Error('NOT_IMPLEMENTED');
}

export async function listMyRequests(_deps: ApiDeps, _idToken: string | undefined): Promise<readonly MyRequestCard[]> {
  throw new Error('NOT_IMPLEMENTED');
}

export async function countAwaitingConfirmation(_deps: ApiDeps, _idToken: string | undefined): Promise<{ readonly count: number }> {
  throw new Error('NOT_IMPLEMENTED');
}
