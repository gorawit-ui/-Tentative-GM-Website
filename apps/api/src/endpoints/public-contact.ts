// A09 — `GET /api/public/contact`: the contact box of the login page (Part 2 Addendum A1.3, UI-01) for
// people without a company account, so no sign-in is asked and no token is looked at. Part 6 §6.4: the
// pre-login contact is a safe subset of `content_pages/contact` — only the entries the Admin put in
// `prelogin_contacts`, only their four display fields, each one short line. Read at most once a minute
// per instance, however many people open the login page (Part 6 §6.9 cost).
import type { PublicContact } from '@gm/contracts';
import type { Instant } from '@gm/time';
import type { ApiDeps } from './deps';

export const MAX_PUBLIC_CONTACTS = 5;
export const PUBLIC_CONTACT_TTL_MS = 60_000;
export const PUBLIC_CONTACT_PATH = 'content_pages/contact';
const MAX_LABEL_CHARS = 80;
const MAX_NAME_CHARS = 80;
const MAX_DETAIL_CHARS = 160;
const PHONE = /^\+?[0-9][0-9 -]{2,19}$/;

/** One trimmed line, cut to `max` characters (the last one “…” when cut); blank → undefined. */
function line(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/\s+/g, ' ').trim();
  if (text === '') return undefined;
  const chars = [...text];
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join('')}…`;
}

/** The pre-login entries of the stored contact page, display fields only. */
export function publicContactsOf(stored: unknown): PublicContact[] {
  const list = typeof stored === 'object' && stored !== null ? (stored as Record<string, unknown>).prelogin_contacts : undefined;
  if (!Array.isArray(list)) return [];
  const contacts: PublicContact[] = [];
  for (const item of list) {
    if (contacts.length === MAX_PUBLIC_CONTACTS) break;
    if (typeof item !== 'object' || item === null) continue;
    const entry = item as Record<string, unknown>;
    const label = line(entry.label, MAX_LABEL_CHARS);
    if (label === undefined) continue;
    const name = line(entry.contact_name, MAX_NAME_CHARS);
    const phone = typeof entry.phone === 'string' && PHONE.test(entry.phone.trim()) ? entry.phone.trim() : undefined;
    const detail = line(entry.detail, MAX_DETAIL_CHARS);
    contacts.push({ label, ...(name === undefined ? {} : { name }), ...(phone === undefined ? {} : { phone }), ...(detail === undefined ? {} : { detail }) });
  }
  return contacts;
}

export interface PublicContactSource {
  get(): Promise<readonly PublicContact[]>;
}

/** The contacts, read again only when the last read is a minute old (per API instance). */
export function publicContactSource(api: Pick<ApiDeps, 'db' | 'now'>): PublicContactSource {
  let cached: { readonly at: Instant; readonly contacts: readonly PublicContact[] } | undefined;
  return {
    async get() {
      const now = api.now();
      if (cached !== undefined && now >= cached.at && now - cached.at < PUBLIC_CONTACT_TTL_MS) return cached.contacts;
      const contacts = publicContactsOf((await api.db.doc(PUBLIC_CONTACT_PATH).get()).data());
      cached = { at: now, contacts };
      return contacts;
    },
  };
}
