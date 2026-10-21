// A09 — the pre-login contact box (Part 2 Addendum A1.3, UI-01): what `GET /api/public/contact` returns.
// Only display fields the Admin chose to show before login (Part 6 §6.4 “pre-login contact เป็น safe
// subset”); no e-mail, Slack or anything else of `content_pages/contact`.
export interface PublicContact {
  /** What to do, e.g. “โทรหาทีม GM”. */
  readonly label: string;
  /** Who answers, e.g. “คุณสมมติ (ทีม GM)”. */
  readonly name?: string;
  /** A plain phone number (digits, spaces, dashes, an optional leading +). */
  readonly phone?: string;
  /** A short line, e.g. where the GM room is. */
  readonly detail?: string;
  /** D-A09-4: a link to tap, e.g. LINE OA or a LINE group — `https:` or `tel:` only (see contactUrlHref). */
  readonly url?: string;
}

export interface PublicContactResponse {
  readonly contacts: readonly PublicContact[];
}

/** `tel:` link of a phone number as returned by the API (digits and a leading + only). */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^0-9+]/g, '')}`;
}

export const MAX_CONTACT_URL_CHARS = 500;
const PHONE_NUMBER = /^\+?[0-9][0-9 -]{2,19}$/;
// `https://` + a DNS host (no user:password@, no IP-less tricks) + optional port + path/query/fragment.
const HTTPS_LINK = /^https:\/\/([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+)(:[0-9]{1,5})?([/?#].*)?$/i;
const NOT_IN_LINK = /[\s\u0000-\u001f\u007f\\<>"`]/;

/**
 * D-A09-4: the link of a pre-login contact as the Admin stored it → the `href` to show, or undefined when
 * it is not one: only `https:` with a host name (no user/password) and `tel:` with a plain number.
 * Anything else (`javascript:`, `data:`, `http:`, `mailto:`, app schemes, relative links) never becomes a
 * link. Pure string rules (no URL parser), so API and web decide the same way.
 */
export function contactUrlHref(stored: unknown): string | undefined {
  if (typeof stored !== 'string') return undefined;
  const text = stored.trim();
  if (text === '' || text.length > MAX_CONTACT_URL_CHARS) return undefined;
  if (/^tel:/i.test(text)) {
    const number = text.slice('tel:'.length).trim();
    return PHONE_NUMBER.test(number) ? telHref(number) : undefined;
  }
  if (NOT_IN_LINK.test(text)) return undefined;
  const link = HTTPS_LINK.exec(text);
  if (link === null) return undefined;
  const [, host = '', port = '', rest = ''] = link;
  return `https://${host.toLowerCase()}${port}${rest === '' ? '/' : rest}`;
}
