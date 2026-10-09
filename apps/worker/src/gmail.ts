// A08 — Gmail outbound adapter (Part 6 §6.10, Part 7 D4, UI-15, A1.2, C3). One `users.messages.send`
// per outbox attempt through the Gmail API with the OAuth token of the company's existing central
// mailbox (`gmail.send` only — never reading mail; approval and the token: P7-ADMIN-02), sent in that
// mailbox's name. The text is the shared notice (`composeNotice`) as plain-text e-mail. It never
// retries by itself — the dispatcher settles the answer (A02 back-off, Retry-After, `delivery_unknown`):
//   200                                    → accepted (`gmail:{message id}`)
//   not a company address, 400 Invalid To  → permanent GMAIL_INVALID_RECIPIENT
//   the app's own cap reached              → deferred EMAIL_CAP_REACHED (no attempt used, §6.10)
//   429 / 403 quota or rate reasons        → retryable (Retry-After when given)
//   no access token, unreachable, 503      → retryable (nothing sent)
//   no answer in time, other 5xx           → unknown: it may have been sent
//   401 / other 403 / other 4xx            → permanent `GMAIL_…`
// Tests point `apiBaseUrl` at a fake on 127.0.0.1; the real Gmail is used only after P7-ADMIN-02.
// Nothing here logs the token, an address, the subject or the body.
import type { DeliveryOutcome } from '@gm/domain';
import type { NotificationAdapter, OutboundMessage } from './adapters';
import { buildMimeMessage, emailContent, type EmailContent, type MailSender } from './email';
import type { EmailQuota } from './email-quota';
import type { WorkerLogger } from './log';
import { composeNotice } from './messages';
import { isCompanyEmail } from './notification-mode';
import { isTimeout, networkFailure, retryAfterMs } from './provider-http';

export interface GmailConfig {
  /** `https://gmail.googleapis.com` in a real deployment; a local fake in tests. */
  readonly apiBaseUrl: string;
  /** A current OAuth access token of the central mailbox (refreshed from Secret Manager); never logged. */
  readonly accessToken: () => Promise<string>;
  /** `GM_MAIL_FROM` / `GM_MAIL_FROM_NAME` (Part 7 D4). */
  readonly sender: MailSender;
  /** Where the message links point (`GM_WEB_BASE_URL`). */
  readonly webBaseUrl: string;
  /** How long to wait for Gmail's answer once the request is sent. */
  readonly timeoutMs: number;
  /** The app's own cap (Part 6 §6.10); none = no cap. */
  readonly quota?: EmailQuota;
}

export const GMAIL_API_BASE_URL = 'https://gmail.googleapis.com';
export const DEFAULT_GMAIL_TIMEOUT_MS = 10_000;

/** 403 reasons that mean “too much, later” rather than “never”. */
const QUOTA_REASONS: ReadonlySet<string> = new Set(['dailyLimitExceeded', 'userRateLimitExceeded', 'rateLimitExceeded', 'quotaExceeded']);

interface GoogleError {
  readonly message: string;
  readonly reason: string;
}

async function googleErrorOf(response: Response): Promise<GoogleError> {
  try {
    const body = (await response.json()) as { error?: { message?: unknown; errors?: { reason?: unknown }[] } };
    const reason = body.error?.errors?.[0]?.reason;
    return { message: typeof body.error?.message === 'string' ? body.error.message : '', reason: typeof reason === 'string' ? reason : '' };
  } catch {
    return { message: '', reason: '' };
  }
}

async function outcomeOf(response: Response): Promise<DeliveryOutcome> {
  if (response.ok) {
    let body: { id?: unknown };
    try {
      body = (await response.json()) as typeof body;
    } catch (error) {
      return { kind: 'unknown', code: isTimeout(error) ? 'GMAIL_TIMEOUT' : 'GMAIL_BAD_RESPONSE' };
    }
    return { kind: 'accepted', providerId: `gmail:${typeof body.id === 'string' ? body.id : '-'}` };
  }
  const retryAfter = retryAfterMs(response.headers.get('retry-after'));
  if (response.status === 429) return { kind: 'retryable', code: 'GMAIL_RATE_LIMITED', ...retryAfter };
  if (response.status === 503) return { kind: 'retryable', code: 'GMAIL_HTTP_503' };
  if (response.status >= 500) return { kind: 'unknown', code: `GMAIL_HTTP_${response.status}` };
  const error = await googleErrorOf(response);
  if (response.status === 403 && QUOTA_REASONS.has(error.reason)) return { kind: 'retryable', code: 'GMAIL_QUOTA_EXCEEDED', ...retryAfter };
  if (response.status === 400) return { kind: 'permanent', code: /\bto header\b|recipient/i.test(error.message) ? 'GMAIL_INVALID_RECIPIENT' : 'GMAIL_BAD_REQUEST' };
  if (response.status === 401) return { kind: 'permanent', code: 'GMAIL_UNAUTHORIZED' };
  if (response.status === 403) return { kind: 'permanent', code: 'GMAIL_FORBIDDEN' };
  return { kind: 'permanent', code: `GMAIL_HTTP_${response.status}` };
}

export function gmailAdapter(config: GmailConfig, log: WorkerLogger): NotificationAdapter {
  const endpoint = `${config.apiBaseUrl.replace(/\/+$/, '')}/gmail/v1/users/me/messages/send`;
  return {
    async send(message: OutboundMessage): Promise<DeliveryOutcome> {
      let content: EmailContent;
      try {
        content = emailContent(composeNotice(message, config.webBaseUrl));
      } catch {
        log.warn('notification.no_template', { outbox_id: message.outboxId, kind: message.eventKind });
        return { kind: 'permanent', code: 'NO_TEMPLATE' };
      }
      // A1.2: company e-mail only, never an address guessed or typed elsewhere.
      const to = message.address.trim().toLowerCase();
      if (!isCompanyEmail(to)) return { kind: 'permanent', code: 'GMAIL_INVALID_RECIPIENT' };
      if (config.quota !== undefined) {
        let decision;
        try {
          decision = await config.quota.reserve();
        } catch {
          return { kind: 'retryable', code: 'EMAIL_CAP_UNAVAILABLE' };
        }
        if (!decision.ok) {
          log.warn('notification.email_cap', { outbox_id: message.outboxId });
          return { kind: 'deferred', code: 'EMAIL_CAP_REACHED', retryAt: decision.retryAt };
        }
      }
      let token: string;
      try {
        token = await config.accessToken();
      } catch {
        return { kind: 'retryable', code: 'GMAIL_AUTH_UNAVAILABLE' };
      }
      const raw = Buffer.from(buildMimeMessage({ from: config.sender, to, subject: content.subject, body: content.body }), 'utf8').toString('base64url');
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=utf-8' },
          body: JSON.stringify({ raw }),
          signal: AbortSignal.timeout(config.timeoutMs),
        });
        return await outcomeOf(response);
      } catch (error) {
        return networkFailure(error, 'GMAIL');
      }
    },
  };
}
