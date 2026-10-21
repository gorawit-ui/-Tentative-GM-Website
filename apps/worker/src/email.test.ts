// A08 — the e-mail made from the same notice as Slack (Part 2 Addendum A1.2 “Slack/email ใช้เลขงาน
// ลิงก์ และขอบเขตข้อความเดียวกัน”, UI-15, C3, D-A07-1): subject “[GM-0427] short line”, a plain-text
// body with the link and a footer saying replies are not recorded. Plain text only — no HTML, so no
// images and no tracking pixel. Thai in the subject and body is encoded as UTF-8 (RFC 2047 / base64)
// so mail clients do not show garbage; the decoder here is independent of the encoder under test.
import { beforeAll, describe, expect, it } from 'vitest';
import { EMAIL_FOOTER, buildMimeMessage, emailContent } from './email';
import { composeNotice, type NoticeContent } from './messages';

const BASE = 'https://gm.example.test';
const TITLE = 'แอร์ไม่เย็น — ห้องประชุม · FAC16';
const base: NoticeContent = { eventKind: 'request_created', audience: 'gm', requestId: 'req-0427', requestNumber: 'GM-0427', confidential: false, summaryTitle: TITLE };
const SENDER = { address: 'gm-notify@tdfb.co', name: 'ทีม GM (แจ้งเตือนอัตโนมัติ)' };

/** RFC 2047 encoded words (B and Q) → text; anything else as is. */
function decodeWords(value: string): string {
  return value.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=(?:\s+(?==\?))?/g, (_whole, charset: string, encoding: string, text: string) => {
    expect(charset.toUpperCase()).toBe('UTF-8');
    const bytes = encoding.toUpperCase() === 'B' ? Buffer.from(text, 'base64') : Buffer.from(text.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16))), 'latin1');
    return bytes.toString('utf8');
  });
}

interface Parsed {
  readonly headerLines: readonly string[];
  readonly headers: ReadonlyMap<string, string>;
  readonly body: string;
}

/** Headers unfolded (case-insensitive names) and the body decoded per Content-Transfer-Encoding. */
function parse(mime: string): Parsed {
  const split = mime.indexOf('\r\n\r\n');
  expect(split).toBeGreaterThan(0);
  const headerLines = mime.slice(0, split).split('\r\n');
  const headers = new Map<string, string>();
  let last = '';
  for (const line of headerLines) {
    if (/^[ \t]/.test(line)) {
      headers.set(last, `${headers.get(last) ?? ''}${line}`);
      continue;
    }
    const colon = line.indexOf(':');
    last = line.slice(0, colon).toLowerCase();
    expect(headers.has(last)).toBe(false);
    headers.set(last, line.slice(colon + 1).trim());
  }
  const raw = mime.slice(split + 4);
  // Text is sent in canonical form (CRLF line ends, RFC 2045); compared here with \n.
  const decoded = headers.get('content-transfer-encoding')?.toLowerCase() === 'base64' ? Buffer.from(raw.replace(/\r\n/g, ''), 'base64').toString('utf8') : raw;
  const body = decoded.replace(/\r\n/g, '\n');
  return { headerLines, headers, body };
}

describe('emailContent: subject “[number] short line”, a plain body, the footer', () => {
  it('general request: number + headline in the subject; title, link and footer in the body', () => {
    const content = emailContent(composeNotice(base, BASE));
    expect(content.subject).toBe('[GM-0427] มีงานใหม่รอรับเรื่อง');
    expect(content.body).toBe(['GM-0427 มีงานใหม่รอรับเรื่อง', TITLE, '', `เปิดงาน: ${BASE}/requests/req-0427`, '', '-- ', EMAIL_FOOTER].join('\n'));
  });

  it('the footer says replies are not recorded and to open the link', () => {
    expect(EMAIL_FOOTER).toBe('อีเมลนี้ส่งอัตโนมัติ การตอบกลับจะไม่ถูกบันทึกในงาน กรุณาเปิดลิงก์เพื่อตอบ');
  });

  it('what the kind adds (note, auto-close time, the button to press) is in the body, in order', () => {
    const content = emailContent(
      composeNotice({ ...base, eventKind: 'waiting_requested', audience: 'waiting_party', actorName: 'ป๊อป', waitingNote: 'ขอใบเสนอราคา 2 ร้าน' }, BASE),
    );
    expect(content.subject).toBe('[GM-0427] ป๊อป (ทีม GM) รอการดำเนินการจากคุณ');
    expect(content.body.split('\n').slice(0, 4)).toEqual([
      'GM-0427 ป๊อป (ทีม GM) รอการดำเนินการจากคุณ',
      TITLE,
      'หมายเหตุ: ขอใบเสนอราคา 2 ร้าน',
      'ทำเสร็จแล้ว กด “ฝั่งฉันเรียบร้อยแล้ว” ในลิงก์',
    ]);
  });

  it('confidential (C3, A1.2): no title, name or note in the subject or the body — the neutral line and what to do', () => {
    const content = emailContent(
      composeNotice({ ...base, confidential: true, eventKind: 'waiting_requested', audience: 'waiting_party', summaryTitle: 'ต่อสัญญาเช่าโกดัง', actorName: 'ป๊อป', waitingNote: 'บันทึกเฉพาะเรื่องสัญญา' }, BASE),
    );
    expect(content.subject).toBe('[GM-0427] รอการดำเนินการจากฝั่งคุณ');
    expect(content.body).toBe(['GM-0427 รอการดำเนินการจากฝั่งคุณ', 'ทำเสร็จแล้ว กด “ฝั่งฉันเรียบร้อยแล้ว” ในลิงก์', '', `เปิดงาน: ${BASE}/requests/req-0427`, '', '-- ', EMAIL_FOOTER].join('\n'));
    for (const secret of ['ต่อสัญญา', 'ป๊อป', 'บันทึกเฉพาะเรื่องสัญญา']) expect(`${content.subject}\n${content.body}`).not.toContain(secret);
  });

  it('no Slack markup leaks into e-mail (no *bold*, no <link|label>, no &amp;)', () => {
    const content = emailContent(composeNotice({ ...base, summaryTitle: 'ประตู & หน้าต่าง <ชั้น 2>' }, BASE));
    expect(content.body).toContain('ประตู & หน้าต่าง <ชั้น 2>');
    expect(`${content.subject}${content.body}`).not.toMatch(/\*GM-0427\*|\|เปิดงาน>|&amp;/);
  });
});

describe('buildMimeMessage: plain text, UTF-8 that decodes back exactly, no way to inject a header', () => {
  let content: { readonly subject: string; readonly body: string };
  let mime: string;
  let parsed: Parsed;
  beforeAll(() => {
    content = emailContent(composeNotice({ ...base, eventKind: 'request_completed', audience: 'requester', autoCloseDueAt: Date.parse('2027-01-14T09:00:00+07:00') }, BASE));
    mime = buildMimeMessage({ from: SENDER, to: 'employee01@tdfb.co', subject: content.subject, body: content.body });
    parsed = parse(mime);
  });

  it('headers are 7-bit ASCII, lines ≤ 78 characters, CRLF line ends', () => {
    for (const line of parsed.headerLines) {
      expect(line).toMatch(/^[\x20-\x7e\t]*$/);
      expect(line.length).toBeLessThanOrEqual(78);
    }
    expect(mime.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('Subject and the From name decode back to the Thai text; To and From addresses as configured', () => {
    expect(decodeWords(parsed.headers.get('subject') ?? '')).toBe(content.subject);
    expect(decodeWords(parsed.headers.get('from') ?? '')).toBe(`${SENDER.name} <gm-notify@tdfb.co>`);
    expect(parsed.headers.get('to')).toBe('employee01@tdfb.co');
  });

  it('one text/plain UTF-8 part (no HTML: no images, no tracking pixel) whose body decodes back exactly', () => {
    expect(parsed.headers.get('mime-version')).toBe('1.0');
    expect(parsed.headers.get('content-type')).toBe('text/plain; charset=UTF-8');
    expect(parsed.headers.get('content-transfer-encoding')).toBe('base64');
    expect(parsed.body).toBe(content.body);
    expect(parsed.body).toContain('ระบบจะปิดอัตโนมัติ 14 ม.ค. 2570 09:00 น. หากไม่มีการตอบกลับ');
    expect(mime).not.toMatch(/text\/html|multipart|<img|<html/i);
    expect(parsed.body.match(/https?:\/\/\S+/g)).toEqual([`${BASE}/requests/req-0427`]);
  });

  it('marked as automatic (RFC 3834) so out-of-office replies are not sent back', () => {
    expect(parsed.headers.get('auto-submitted')).toBe('auto-generated');
  });

  it('a long Thai subject is split into encoded words of ≤ 75 characters, never inside a character', () => {
    const long = `[GM-0427] ${'ก'.repeat(80)}`;
    const folded = parse(buildMimeMessage({ from: SENDER, to: 'a@tdfb.co', subject: long, body: 'x' }));
    const words = (folded.headers.get('subject') ?? '').match(/=\?[^?]+\?B\?[^?]*\?=/g) ?? [];
    expect(words.length).toBeGreaterThan(1);
    for (const word of words) expect(word.length).toBeLessThanOrEqual(75);
    expect(decodeWords(folded.headers.get('subject') ?? '')).toBe(long);
  });

  it('a subject with a line break cannot add a header', () => {
    const injected = parse(buildMimeMessage({ from: SENDER, to: 'a@tdfb.co', subject: 'x\r\nBcc: outsider@example.com', body: 'x' }));
    expect([...injected.headers.keys()]).not.toContain('bcc');
  });

  it.each(['a@tdfb.co\r\nBcc: outsider@example.com', 'a@tdfb.co, b@tdfb.co', 'not an address', ''])('refuses the recipient %j', (to) => {
    expect(() => buildMimeMessage({ from: SENDER, to, subject: 's', body: 'b' })).toThrow(RangeError);
  });
});
