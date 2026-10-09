// A07 — stub (red): implemented in the next commit.
import type { OutboundMessage } from './adapters';

export interface NoticeContent {
  readonly eventKind: string;
  readonly audience: OutboundMessage['audience'];
  readonly requestId: string;
  readonly requestNumber: string;
  readonly confidential: boolean;
  readonly summaryTitle?: string;
  readonly autoCloseDueAt?: number;
  readonly waitingLabel?: string;
  readonly variant?: 'unassigned';
}

export interface RenderedNotice {
  readonly headline: string;
  readonly link: string;
  readonly text: string;
}

export function renderNotice(_notice: NoticeContent, _webBaseUrl: string): RenderedNotice {
  throw new Error('renderNotice: not implemented');
}
