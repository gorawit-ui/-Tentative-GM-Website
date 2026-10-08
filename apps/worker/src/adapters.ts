// A02 — notification adapters. Until A07 (Slack) / A08 (Gmail, central mailbox) and the
// P7-ADMIN-02/03 approvals there are two: `local` logs that a message would go out and accepts it
// (nothing leaves the machine, nobody real is notified) and `disabled` refuses, so the entry ends
// `failed` and the GM sees it was not sent. The message text (templates, confidential wording) is
// A07/A08's; the adapter gets only what it needs to address and number the message.
import type { DeliveryChannel, DeliveryOutcome } from '@gm/domain';
import type { WorkerLogger } from './log';
import type { NotificationMode } from './notification-mode';

export interface OutboundMessage {
  readonly outboxId: string;
  readonly channel: DeliveryChannel;
  /** Slack user ID or company e-mail: for the provider only, never logged. */
  readonly address: string;
  readonly eventKind: string;
  /** `watcher`: a public-summary notice (U1), never detail; `waiting_party`: the person or contact waited on (A04). */
  readonly audience: 'gm' | 'requester' | 'watcher' | 'waiting_party';
  readonly requestId: string;
  /** D-A01-4: the number the recipient sees (confidential requests too: number + neutral text + link). */
  readonly requestNumber: string;
  readonly confidential: boolean;
}

export interface NotificationAdapter {
  /** Resolves with the provider's answer; a rejection means the result is unknown. */
  send(message: OutboundMessage): Promise<DeliveryOutcome>;
}

export function localAdapter(log: WorkerLogger): NotificationAdapter {
  return {
    async send(message) {
      log.info('notification.local', { outbox_id: message.outboxId, channel: message.channel, kind: message.eventKind });
      return { kind: 'accepted', providerId: `local-${message.outboxId}` };
    },
  };
}

export function disabledAdapter(): NotificationAdapter {
  return { send: async () => ({ kind: 'permanent', code: 'CHANNEL_DISABLED' }) };
}

export function notificationAdapter(mode: NotificationMode, log: WorkerLogger): NotificationAdapter {
  return mode === 'local' ? localAdapter(log) : disabledAdapter();
}
