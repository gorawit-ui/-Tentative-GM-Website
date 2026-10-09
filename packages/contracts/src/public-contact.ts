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
}

export interface PublicContactResponse {
  readonly contacts: readonly PublicContact[];
}

/** `tel:` link of a phone number as returned by the API (digits and a leading + only). */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^0-9+]/g, '')}`;
}
