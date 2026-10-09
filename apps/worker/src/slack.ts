// A07 — stub (red): implemented in the next commit.
import type { NotificationAdapter } from './adapters';
import type { WorkerLogger } from './log';

export interface SlackConfig {
  readonly apiBaseUrl: string;
  readonly token: string;
  readonly webBaseUrl: string;
  readonly timeoutMs: number;
}

export function slackAdapter(_config: SlackConfig, _log: WorkerLogger): NotificationAdapter {
  return {
    send: async () => {
      throw new Error('slackAdapter: not implemented');
    },
  };
}
