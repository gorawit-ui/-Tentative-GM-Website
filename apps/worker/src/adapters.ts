// A02 stub — implemented after the failing tests are committed.
import type { DeliveryChannel, DeliveryOutcome } from '@gm/domain';
import type { WorkerLogger } from './log';
import type { NotificationMode } from './notification-mode';

export interface OutboundMessage {
  readonly outboxId: string;
  readonly channel: DeliveryChannel;
  readonly address: string;
  readonly eventKind: string;
  readonly audience: 'gm' | 'requester';
  readonly requestId: string;
  readonly requestNumber: string;
  readonly confidential: boolean;
}

export interface NotificationAdapter {
  send(message: OutboundMessage): Promise<DeliveryOutcome>;
}

const notReady: NotificationAdapter = { send: () => Promise.reject(new Error('not implemented')) };

export function localAdapter(_log: WorkerLogger): NotificationAdapter {
  return notReady;
}

export function disabledAdapter(): NotificationAdapter {
  return notReady;
}

export function notificationAdapter(_mode: NotificationMode, _log: WorkerLogger): NotificationAdapter {
  return notReady;
}
