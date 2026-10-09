// A02 — notification adapters. Until the P7-ADMIN-02/03 approvals the worker runs one of two modes:
// `local` renders the message (A07: a missing template shows up in dev) and logs that it would go
// out, then accepts it — nothing leaves the machine, nobody real is notified; `disabled` refuses, so
// the entry ends `failed` and the GM sees it was not sent. A07: the Slack adapter (`./slack`) exists
// and is tested against a local fake, but no runtime mode uses it until P7-ADMIN-03 (FU-33);
// `channelRouter` sends each message through the adapter of its channel. The adapter gets only what
// it needs to address, number and word the message — never the description, photos or notes.
import type { DeliveryChannel, DeliveryOutcome } from '@gm/domain';
import type { WorkerLogger } from './log';
import { renderNotice } from './messages';
import { DEFAULT_WEB_BASE_URL, type NotificationMode, type SandboxRecipients } from './notification-mode';

export interface OutboundMessage {
  readonly outboxId: string;
  readonly channel: DeliveryChannel;
  /** Slack user ID or company e-mail: for the provider only, never logged. */
  readonly address: string;
  readonly eventKind: string;
  /** `watcher`: a public-summary notice (U1), never detail; `waiting_party`: the person or contact waited on (A04); `related`: just added (D-A04-3). */
  readonly audience: 'gm' | 'requester' | 'watcher' | 'waiting_party' | 'related';
  readonly requestId: string;
  /** D-A01-4: the number the recipient sees (confidential requests too: number + neutral text + link). */
  readonly requestNumber: string;
  /** The request is confidential now or was when the notice was queued: number + neutral text + link (C3). */
  readonly confidential: boolean;
  /** A07: the public board title of a general request at send time; absent when confidential. */
  readonly summaryTitle?: string;
  /** A07: `request_completed` — the real auto-close time (UI-15). */
  readonly autoCloseDueAt?: number;
  /** A07: `request_waiting` — the public label of who it waits on (D-S09-1). */
  readonly waitingLabel?: string;
  /** A07: the all-GM notice of an unassigned request (A3). */
  readonly variant?: 'unassigned';
  /** D-A07-1: who acted / answered and the notes — read at send time, general requests only. */
  readonly actorName?: string;
  readonly waitingNote?: string;
  readonly responderLabel?: string;
  readonly responseNote?: string;
}

export interface NotificationAdapter {
  /** Resolves with the provider's answer; a rejection means the result is unknown. */
  send(message: OutboundMessage): Promise<DeliveryOutcome>;
}

export function localAdapter(log: WorkerLogger, webBaseUrl: string = DEFAULT_WEB_BASE_URL): NotificationAdapter {
  return {
    async send(message) {
      try {
        renderNotice(message, webBaseUrl);
      } catch {
        log.warn('notification.no_template', { outbox_id: message.outboxId, kind: message.eventKind });
        return { kind: 'permanent', code: 'NO_TEMPLATE' };
      }
      log.info('notification.local', { outbox_id: message.outboxId, channel: message.channel, kind: message.eventKind });
      return { kind: 'accepted', providerId: `local-${message.outboxId}` };
    },
  };
}

export function disabledAdapter(): NotificationAdapter {
  return { send: async () => ({ kind: 'permanent', code: 'CHANNEL_DISABLED' }) };
}

export function notificationAdapter(mode: NotificationMode, log: WorkerLogger, options?: { readonly webBaseUrl: string }): NotificationAdapter {
  return mode === 'local' ? localAdapter(log, options?.webBaseUrl) : disabledAdapter();
}

/**
 * D-A07-8: dev / local notify only the approved sandbox list; anyone else is `suppressed` without the
 * provider being called. A blank Slack ID goes on (the Slack adapter answers “not mapped” and the
 * e-mail fallback is checked here in turn).
 */
export function sandboxAdapter(inner: NotificationAdapter, sandbox: SandboxRecipients): NotificationAdapter {
  return {
    send: async (message) => {
      const address = message.address.trim();
      const listed =
        message.channel === 'slack' ? address === '' || sandbox.slackUserIds.has(address) : sandbox.emails.has(address.toLowerCase());
      return listed ? inner.send(message) : { kind: 'suppressed', code: 'NOT_IN_SANDBOX' };
    },
  };
}

/** One adapter per channel (A1.2): Slack DM or company e-mail, chosen by the dispatcher. */
export function channelRouter(adapters: Readonly<Record<DeliveryChannel, NotificationAdapter>>): NotificationAdapter {
  return { send: (message) => adapters[message.channel].send(message) };
}
