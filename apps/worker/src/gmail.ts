// A08 — stub (red): implemented in the next commit.
import type { NotificationAdapter } from './adapters';
import type { MailSender } from './email';
import type { EmailQuota } from './email-quota';
import type { WorkerLogger } from './log';

export interface GmailConfig {
  readonly apiBaseUrl: string;
  readonly accessToken: () => Promise<string>;
  readonly sender: MailSender;
  readonly webBaseUrl: string;
  readonly timeoutMs: number;
  readonly quota?: EmailQuota;
}

export function gmailAdapter(_config: GmailConfig, _log: WorkerLogger): NotificationAdapter {
  return {
    send: async () => {
      throw new Error('A08 stub: gmailAdapter not implemented');
    },
  };
}
