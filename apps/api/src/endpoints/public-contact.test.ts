// A09 — the pre-login contact box (Part 2 Addendum A1.3, UI-01, Part 6 §6.4 “pre-login contact เป็น safe
// subset”): only what the Admin put in `content_pages/contact.prelogin_contacts`, only the four display
// fields, each one short line; anything else in the document never leaves the API before login.
import { describe, expect, it } from 'vitest';
import { MAX_PUBLIC_CONTACTS, publicContactsOf } from './public-contact';

describe('publicContactsOf', () => {
  it('label, contact name, phone and a short detail — nothing else of the document', () => {
    expect(
      publicContactsOf({
        title: 'ติดต่อ GM',
        body: 'ข้อมูลหลังเข้าสู่ระบบ',
        faq: [{ q: 'x', a: 'y' }],
        prelogin_contacts: [
          { label: 'โทรหาทีม GM', contact_name: 'คุณตัวอย่าง', phone: '02-000-0000', email: 'gm.private@tdfb.co', slack: 'U123', note_internal: 'ห้ามเผย' },
          { label: 'แจ้งที่ห้องทีม GM', detail: 'อาคาร WH300 ชั้น 1' },
        ],
      }),
    ).toEqual([
      { label: 'โทรหาทีม GM', name: 'คุณตัวอย่าง', phone: '02-000-0000' },
      { label: 'แจ้งที่ห้องทีม GM', detail: 'อาคาร WH300 ชั้น 1' },
    ]);
  });

  it.each([undefined, null, 'x', 42, {}, { prelogin_contacts: 'โทร 02' }, { prelogin_contacts: {} }])('no list → nothing (%o)', (stored) => {
    expect(publicContactsOf(stored)).toEqual([]);
  });

  it('an entry without a label, or not an object, is left out', () => {
    expect(publicContactsOf({ prelogin_contacts: [null, 'โทร', { phone: '020000000' }, { label: '   ' }, { label: 'โทรหา GM', phone: '020000000' }] })).toEqual([
      { label: 'โทรหา GM', phone: '020000000' },
    ]);
  });

  it.each(['02-000-0000 ต่อ 12', 'tel:020000000', '<a href=x>', '1', '0'.repeat(25), 'javascript:alert(1)'])('a phone that is not a plain number is left out (%j); the rest stays', (phone) => {
    expect(publicContactsOf({ prelogin_contacts: [{ label: 'โทรหา GM', phone }] })).toEqual([{ label: 'โทรหา GM' }]);
  });

  it('text is one trimmed line, cut to a short length', () => {
    const [contact] = publicContactsOf({ prelogin_contacts: [{ label: `  โทร\nหา   GM  `, contact_name: 'ก'.repeat(200), detail: 'ข'.repeat(300) }] });
    expect(contact?.label).toBe('โทร หา GM');
    expect([...(contact?.name ?? '')]).toHaveLength(80);
    expect([...(contact?.detail ?? '')]).toHaveLength(160);
  });

  it('D-A09-4: a link (LINE OA, a LINE group, a phone) — https: and tel: only', () => {
    expect(
      publicContactsOf({
        prelogin_contacts: [
          { label: 'แชท LINE OA ทีม GM', url: 'https://line.me/R/ti/p/@gm-example', detail: 'ตอบในเวลาทำการ' },
          { label: 'โทรหา GM', url: 'tel:02-000-0000' },
          { label: 'กลุ่ม LINE', url: 'javascript:alert(1)', detail: 'ถามในกลุ่ม' },
          { label: 'เว็บเก่า', url: 'http://example.com/gm' },
        ],
      }),
    ).toEqual([
      { label: 'แชท LINE OA ทีม GM', url: 'https://line.me/R/ti/p/@gm-example', detail: 'ตอบในเวลาทำการ' },
      { label: 'โทรหา GM', url: 'tel:020000000' },
      { label: 'กลุ่ม LINE', detail: 'ถามในกลุ่ม' },
      { label: 'เว็บเก่า' },
    ]);
  });

  it(`at most ${MAX_PUBLIC_CONTACTS} entries, with links too`, () => {
    const many = Array.from({ length: 9 }, (_unused, index) => ({ label: `ช่องทาง ${index + 1}`, url: `https://example.com/${index + 1}` }));
    const contacts = publicContactsOf({ prelogin_contacts: many });
    expect(contacts).toHaveLength(MAX_PUBLIC_CONTACTS);
    expect(contacts.at(-1)).toEqual({ label: 'ช่องทาง 5', url: 'https://example.com/5' });
  });

  it(`at most ${MAX_PUBLIC_CONTACTS} entries`, () => {
    const many = Array.from({ length: 9 }, (_unused, index) => ({ label: `ช่องทาง ${index + 1}` }));
    expect(publicContactsOf({ prelogin_contacts: many })).toHaveLength(MAX_PUBLIC_CONTACTS);
  });
});
