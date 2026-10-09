// A07 — Slack outbound adapter (Part 6 §6.10, UI-15, A1.2, C1). One `chat.postMessage` per outbox
// attempt: a DM to the person's Slack user ID with the bot token, plain mrkdwn text from
// `renderNotice`, no blocks or buttons (phase A is one way), link previews off. It never retries by
// itself — the dispatcher settles the answer (A02 back-off, Retry-After, `delivery_unknown`):
//   ok                                   → accepted (`slack:{channel}:{ts}`)
//   user/channel not found, no Slack ID  → unmapped: nothing was posted, the worker uses e-mail (A1.2)
//   the user is disabled (D-A07-4)       → unmapped `SLACK_USER_DISABLED`: e-mail too
//   429 / `ratelimited`                  → retryable, with Retry-After when Slack gives one
//   unreachable before sending, 503      → retryable
//   no answer in time, 500, Slack's own internal error → unknown: it may have been posted
//   anything else (bad token, the app's account inactive, missing scope…) → permanent `SLACK_<ERROR>`
// Tests point `apiBaseUrl` at a fake on 127.0.0.1; the real Slack is used only after P7-ADMIN-03.
// Nothing here logs the token, the Slack ID, the number or the text.
import type { DeliveryOutcome } from '@gm/domain';
import type { NotificationAdapter, OutboundMessage } from './adapters';
import type { WorkerLogger } from './log';
import { renderNotice } from './messages';
import { isTimeout, networkFailure, retryAfterMs } from './provider-http';

export interface SlackConfig {
  /** `https://slack.com/api` in a real deployment; a local fake in tests. */
  readonly apiBaseUrl: string;
  /** Bot token (`xoxb-…`) from the runtime's secret store; never logged. */
  readonly token: string;
  /** Where the message links point (`GM_WEB_BASE_URL`). */
  readonly webBaseUrl: string;
  /** How long to wait for Slack's answer once the request is sent. */
  readonly timeoutMs: number;
}

export const SLACK_API_BASE_URL = 'https://slack.com/api';
export const DEFAULT_SLACK_TIMEOUT_MS = 10_000;

/** Slack cannot reach the stored ID (unknown, or D-A07-4 the user is disabled): nothing was posted. */
const UNMAPPED_ERRORS: ReadonlySet<string> = new Set(['user_not_found', 'channel_not_found']);
const DISABLED_ERRORS: ReadonlySet<string> = new Set(['user_disabled']);
/** Slack failed on its side after receiving the request: it may have been posted. */
const UNKNOWN_ERRORS: ReadonlySet<string> = new Set(['internal_error', 'fatal_error', 'request_timeout']);
/** Slack refused before doing anything; worth another try later. */
const RETRYABLE_ERRORS: ReadonlySet<string> = new Set(['service_unavailable']);

/** `SLACK_` + Slack's error word, upper-case and safe for the log and the entry. */
function errorCode(error: unknown): string {
  const word = typeof error === 'string' ? error.toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 48) : '';
  return word === '' ? 'SLACK_ERROR' : `SLACK_${word}`;
}


async function outcomeOf(response: Response): Promise<DeliveryOutcome> {
  if (response.status === 429) return { kind: 'retryable', code: 'SLACK_RATE_LIMITED', ...retryAfterMs(response.headers.get('retry-after')) };
  if (response.status === 503) return { kind: 'retryable', code: 'SLACK_HTTP_503' };
  if (response.status >= 500) return { kind: 'unknown', code: `SLACK_HTTP_${response.status}` };
  if (!response.ok) return { kind: 'permanent', code: `SLACK_HTTP_${response.status}` };
  let body: { ok?: unknown; error?: unknown; channel?: unknown; ts?: unknown };
  try {
    body = (await response.json()) as typeof body;
  } catch (error) {
    if (isTimeout(error)) return { kind: 'unknown', code: 'SLACK_TIMEOUT' };
    return { kind: 'unknown', code: 'SLACK_BAD_RESPONSE' };
  }
  if (body.ok === true) return { kind: 'accepted', providerId: `slack:${String(body.channel ?? '-')}:${String(body.ts ?? '-')}` };
  const error = typeof body.error === 'string' ? body.error : '';
  if (UNMAPPED_ERRORS.has(error)) return { kind: 'unmapped' };
  if (DISABLED_ERRORS.has(error)) return { kind: 'unmapped', code: errorCode(error) };
  if (error === 'ratelimited') return { kind: 'retryable', code: 'SLACK_RATE_LIMITED', ...retryAfterMs(response.headers.get('retry-after')) };
  if (UNKNOWN_ERRORS.has(error)) return { kind: 'unknown', code: errorCode(error) };
  if (RETRYABLE_ERRORS.has(error)) return { kind: 'retryable', code: errorCode(error) };
  return { kind: 'permanent', code: errorCode(error) };
}

export function slackAdapter(config: SlackConfig, log: WorkerLogger): NotificationAdapter {
  const endpoint = `${config.apiBaseUrl.replace(/\/+$/, '')}/chat.postMessage`;
  return {
    async send(message: OutboundMessage): Promise<DeliveryOutcome> {
      let text: string;
      try {
        text = renderNotice(message, config.webBaseUrl).text;
      } catch {
        log.warn('notification.no_template', { outbox_id: message.outboxId, kind: message.eventKind });
        return { kind: 'permanent', code: 'NO_TEMPLATE' };
      }
      const channel = message.address.trim();
      if (channel === '') return { kind: 'unmapped' };
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json; charset=utf-8' },
          body: JSON.stringify({ channel, text, unfurl_links: false, unfurl_media: false }),
          signal: AbortSignal.timeout(config.timeoutMs),
        });
        return await outcomeOf(response);
      } catch (error) {
        return networkFailure(error, 'SLACK');
      }
    },
  };
}
