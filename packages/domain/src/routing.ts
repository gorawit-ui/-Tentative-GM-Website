// Initial assignment of a new request (S07: PRD §2/§6.9, A3, Part 3 §13.3, Part 6 §6.9).
// Pure: the caller passes the latest default-owner profile and `now`; nothing is sent here.
import type { Instant } from '@gm/time';
import { isOnLeave, type GmProfile } from './presence';
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

/**
 * New request assignment: a GM's explicit choice is kept (leave shown); otherwise the default owner
 * of the type, unless none is configured or they are on effective leave now → queued, unassigned,
 * all GM notified (A3). Only new requests are routed; existing work is never moved.
 */
export function routeNewRequest(input: RouteNewRequestInput): RoutingResult {
  const { now, chosenAssigneeId } = input;
  if (chosenAssigneeId !== undefined) {
    const chosenProfile = input.chosenAssigneeProfile;
    if (chosenProfile !== undefined && chosenProfile.personId !== chosenAssigneeId) {
      throw new Error('chosen assignee profile does not match the chosen assignee');
    }
    return {
      status: 'queued',
      assigneeId: chosenAssigneeId,
      reason: 'chosen_by_gm',
      notice: { kind: 'assignee', personId: chosenAssigneeId },
      assigneeOnLeave: isOnLeave(chosenProfile, now),
    };
  }
  const ownerId = input.settings.defaultOwnerByType[input.type];
  if (ownerId === undefined) return { status: 'queued', reason: 'no_default_owner', notice: { kind: 'all_gm' } };
  const ownerProfile = input.defaultOwnerProfile;
  if (ownerProfile !== undefined && ownerProfile.personId !== ownerId) {
    throw new Error('default owner profile does not match the configured default owner');
  }
  if (isOnLeave(ownerProfile, now)) {
    return { status: 'queued', reason: 'default_owner_on_leave', notice: { kind: 'all_gm' } };
  }
  return {
    status: 'queued',
    assigneeId: ownerId,
    reason: 'default_owner',
    notice: { kind: 'assignee', personId: ownerId },
  };
}
