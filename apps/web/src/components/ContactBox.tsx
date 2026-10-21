// A09 — “ไม่มีบัญชีบริษัท? แจ้งทีม GM” (Part 2 Addendum A1.3, UI-01): the contacts the Admin chose to
// show before login, from the API (no sign-in needed; Part 6 §6.4 safe subset). No form and no anonymous
// request: the GM team opens it for them (F03 on behalf). UI-01 Loading keeps the box usable.
import { useEffect, useState } from 'react';
import { telHref, type PublicContact, type PublicContactResponse } from '@gm/contracts';
import { webConfig } from '../firebase';
import { Icon } from './Icon';

type Load = { readonly kind: 'loading' } | { readonly kind: 'failed' } | { readonly kind: 'ready'; readonly contacts: readonly PublicContact[] };

async function fetchContacts(signal: AbortSignal): Promise<readonly PublicContact[]> {
  const response = await fetch(`${webConfig.apiBaseUrl}/api/public/contact`, { signal, credentials: 'omit' });
  if (!response.ok) throw new Error(`contact ${response.status}`);
  const body = (await response.json()) as Partial<PublicContactResponse>;
  return Array.isArray(body.contacts) ? body.contacts : [];
}

export function ContactBox() {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    fetchContacts(controller.signal).then(
      (contacts) => {
        if (active) setLoad({ kind: 'ready', contacts });
      },
      () => {
        if (active) setLoad({ kind: 'failed' });
      },
    );
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [attempt]);

  return (
    <section className="gm-contact-box" aria-labelledby="no-account-heading">
      <h2 id="no-account-heading">ไม่มีบัญชีบริษัท? แจ้งทีม GM</h2>
      <p>ทีม GM จะช่วยเปิดเรื่องให้ ติดต่อได้ตามช่องทางด้านล่าง ไม่ต้องเข้าสู่ระบบ</p>
      {load.kind === 'loading' && <p role="status">กำลังโหลดช่องทางติดต่อ…</p>}
      {load.kind === 'failed' && (
        <div className="gm-notice gm-notice--warning" role="status">
          <p>โหลดช่องทางติดต่อไม่สำเร็จ</p>
          <button
            type="button"
            className="gm-btn gm-btn--secondary min-h-touch px-3 text-caption font-semibold"
            onClick={() => {
              setLoad({ kind: 'loading' });
              setAttempt((count) => count + 1);
            }}
          >
            ลองใหม่
          </button>
        </div>
      )}
      {load.kind === 'ready' && load.contacts.length === 0 && <p>ผู้ดูแลยังไม่ได้ตั้งช่องทางติดต่อสำหรับหน้านี้</p>}
      {load.kind === 'ready' && load.contacts.length > 0 && (
        <ul className="gm-contact-list">
          {load.contacts.map((contact, index) => (
            <li key={`${index}-${contact.label}`}>
              <span className="gm-contact-label">{contact.label}</span>
              {contact.name !== undefined && <span>{contact.name}</span>}
              {contact.phone !== undefined && (
                <a className="gm-link gm-text-link text-brand-fg font-semibold" href={telHref(contact.phone)}>
                  <Icon name="phone" />
                  {contact.phone}
                </a>
              )}
              {contact.detail !== undefined && <span className="gm-contact-detail">{contact.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
