// Initial assignment of a new request (S07: PRD §2/§6.9, A3, Part 3 §13.3, Part 6 §6.9; D-S07-2/3/5,
// D-S08-1/2).
// Pure: the caller passes the latest facts about the default owner and `now`; nothing is sent here.
import type { Instant } from '@gm/time';
import { isOnLeave, type GmProfile } from './presence';
import type { RequestType } from './request-creation';

/**
 * Admin settings: default owner per service type (e.g. maintenance → Sirirat, PRD §2). A gm_task
 * always starts with the GM who created it (D-S07-2), so it has no setting.
 */
export interface RoutingSettings {
  readonly defaultOwnerByType: Partial<Record<Exclude<RequestType, 'gm_task'>, string>>;
}

/** Latest facts about a GM, read by the caller when the request is saved. */
export interface GmMember {
  readonly personId: string;
  /** `people.active` / `access.enabled`: an inactive GM is never routed to or notified. */
  readonly active: boolean;
  /** Latest `gm_profiles` document; absent = never set = not on leave. */
  readonly profile?: GmProfile | undefined;
}

export type RoutingReason =
  | 'default_owner'
  | 'gm_task_creator'
  | 'default_owner_on_leave'
  | 'default_owner_inactive'
  | 'no_default_owner'
  | 'chosen_by_gm';

export type RoutingNotice =
  | { readonly kind: 'assignee'; readonly personId: string }
  | { readonly kind: 'all_gm' }
  /** D-S08-2: the only person to tell is the one who acted. */
  | { readonly kind: 'none' };

export interface RoutingResult {
  readonly status: 'queued';
  readonly assigneeId?: string;
  readonly reason: RoutingReason;
  /** Who to notify about the new request (computed only); `all_gm` → `allGmNoticeRecipients`. */
  readonly notice: RoutingNotice;
  /** A3: a GM's explicit choice of someone on leave is allowed but must be visible. */
  readonly assigneeOnLeave?: boolean;
}

export interface RouteNewRequestInput {
  readonly type: RequestType;
  readonly now: Instant;
  readonly settings: RoutingSettings;
  /** Who saved the request: the default owner of a gm_task (D-S07-2); unused for service types. */
  readonly createdById: string;
  /** Facts about the default owner: the configured owner of the type, or the gm_task creator. */
  readonly defaultOwner?: GmMember | undefined;
  /** A GM creating the request chose the assignee themselves. */
  readonly chosenAssigneeId?: string | undefined;
  readonly chosenAssigneeProfile?: GmProfile | undefined;
}

const UNASSIGNED_NOTICE: RoutingNotice = { kind: 'all_gm' };

/**
 * New request assignment: a GM's explicit choice is kept (leave shown); otherwise the default owner
 * — the creating GM for a gm_task (D-S07-2), the configured owner of the type for everything else,
 * including requests a GM opens on behalf. No owner, an inactive owner (D-S07-5) or an owner on
 * effective leave now → queued, unassigned, all GM notified (A3). Existing work is never moved.
 */
export function routeNewRequest(input: RouteNewRequestInput): RoutingResult {
  const { now, chosenAssigneeId, createdById } = input;
  if (chosenAssigneeId !== undefined) {
    const chosenProfile = input.chosenAssigneeProfile;
    if (chosenProfile !== undefined && chosenProfile.personId !== chosenAssigneeId) {
      throw new Error('chosen assignee profile does not match the chosen assignee');
    }
    return {
      status: 'queued',
      assigneeId: chosenAssigneeId,
      reason: 'chosen_by_gm',
      notice: noticeFor(chosenAssigneeId, createdById),
      assigneeOnLeave: isOnLeave(chosenProfile, now),
    };
  }
  const isGmTask = input.type === 'gm_task';
  const ownerId = input.type === 'gm_task' ? createdById : input.settings.defaultOwnerByType[input.type];
  if (ownerId === undefined) return { status: 'queued', reason: 'no_default_owner', notice: UNASSIGNED_NOTICE };
  const owner = input.defaultOwner;
  if (owner === undefined || owner.personId !== ownerId) {
    throw new Error(
      isGmTask
        ? 'default owner facts must describe the gm_task creator'
        : 'default owner facts must describe the configured default owner',
    );
  }
  if (owner.profile !== undefined && owner.profile.personId !== ownerId) {
    throw new Error('default owner profile does not match the default owner');
  }
  if (!owner.active) return { status: 'queued', reason: 'default_owner_inactive', notice: UNASSIGNED_NOTICE };
  // D-S08-1: a GM who creates a gm_task is working, even on leave; A3 applies to type routing only.
  if (!isGmTask && isOnLeave(owner.profile, now)) {
    return { status: 'queued', reason: 'default_owner_on_leave', notice: UNASSIGNED_NOTICE };
  }
  return {
    status: 'queued',
    assigneeId: ownerId,
    reason: isGmTask ? 'gm_task_creator' : 'default_owner',
    notice: noticeFor(ownerId, createdById),
  };
}

/** D-S08-2: nobody is notified about their own action. */
function noticeFor(assigneeId: string, actorId: string): RoutingNotice {
  return assigneeId === actorId ? { kind: 'none' } : { kind: 'assignee', personId: assigneeId };
}

/**
 * D-S07-3: “แจ้ง GM ทุกคน” reaches every active GM not on effective leave now; when every active
 * GM is on leave, all of them are notified so the request does not go silent. D-S08-2: the GM who
 * acted (`actorId`) counts as available but is never in the list. Input order kept.
 */
export function allGmNoticeRecipients(
  members: readonly GmMember[],
  now: Instant,
  actorId?: string | undefined,
): readonly string[] {
  const active = [...new Map(members.filter((member) => member.active).map((member) => [member.personId, member])).values()];
  const available = active.filter((member) => !isOnLeave(member.profile, now));
  return (available.length > 0 ? available : active)
    .map((member) => member.personId)
    .filter((personId) => personId !== actorId);
}
