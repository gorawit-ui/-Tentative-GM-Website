// A08 — stub (red): implemented in the next commit.
import type { ComposedNotice } from './messages';

export interface MailSender {
  readonly address: string;
  readonly name: string;
}

export const EMAIL_FOOTER = '';

export function emailContent(_notice: ComposedNotice): { readonly subject: string; readonly body: string } {
  throw new Error('A08 stub: emailContent not implemented');
}

export function buildMimeMessage(_input: { readonly from: MailSender; readonly to: string; readonly subject: string; readonly body: string }): string {
  throw new Error('A08 stub: buildMimeMessage not implemented');
}
