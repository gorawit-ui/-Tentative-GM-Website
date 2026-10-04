// Initial assignment of a new request (S07: PRD §2/§6.9, A3, Part 3 §13.3, Part 6 §6.9).
// Pure: the caller passes the latest default-owner profile and `now`; nothing is sent here.
import type { Instant } from '@gm/time';
import type { GmProfile } from './presence';
import type { RequestType } from './request-creation';

/** Admin settings: default owner per request type (e.g. maintenance → Sirirat, PRD §2). */
export interface RoutingSettings {
  readonly defaultOwnerByType: Partial<Record<RequestType, string>>;
}

export type RoutingReason = 'default_owner' | 'default_owner_on_leave' | 'no_default_owner' | 'chosen_by_gm';

export type RoutingNotice = { readonly kind: 'assignee'; readonly personId: string } | { readonly kind: 'all_gm' };

export interface RoutingResult {
  readonly status: 'queued';
  readonly assigneeId?: string;
  readonly reason: RoutingReason;
  /** Who to notify about the new request (computed only). */
  readonly notice: RoutingNotice;
  /** A3: a GM's explicit choice of someone on leave is allowed but must be visible. */
  readonly assigneeOnLeave?: boolean;
}

export interface RouteNewRequestInput {
  readonly type: RequestType;
  readonly now: Instant;
  readonly settings: RoutingSettings;
  /** Latest profile of the configured default owner (absent profile = not on leave). */
  readonly defaultOwnerProfile?: GmProfile | undefined;
  /** A GM creating the request chose the assignee themselves. */
  readonly chosenAssigneeId?: string | undefined;
  readonly chosenAssigneeProfile?: GmProfile | undefined;
}

export function routeNewRequest(_input: RouteNewRequestInput): RoutingResult {
  throw new Error('routeNewRequest: not implemented yet (S07)');
}
