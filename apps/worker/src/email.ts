// A08 — the e-mail made from the same notice as Slack (Part 2 Addendum A1.2 “Slack/email ใช้เลขงาน
// ลิงก์ และขอบเขตข้อความเดียวกัน”, UI-15, C3, D-A07-1). Subject “[GM-0427] short line”, a plain-text
// body: the number and line, the title and what the kind adds, the link, and a footer saying replies
// are not recorded (people reply to e-mail as a habit; phase A records answers only in the web).
// Plain text only — no HTML part, so no images and no tracking pixel. Thai is sent as UTF-8: the
// subject and the sender name as RFC 2047 encoded words (≤ 75 characters, never split inside a
// character), the body base64 in canonical CRLF form, so every header line stays 7-bit ASCII and
// nothing a title or note contains can add a header. Pure: no I/O.
import type { ComposedNotice } from './messages';

/** Part 7 D4: the company's existing central mailbox (or its send-as alias) and a display name. */
export interface MailSender {
  readonly address: string;
  readonly name: string;
}

export interface EmailContent {
  readonly subject: string;
  /** Plain text, `\n` line ends. */
  readonly body: string;
}

export const EMAIL_FOOTER = 'อีเมลนี้ส่งอัตโนมัติ การตอบกลับจะไม่ถูกบันทึกในงาน กรุณาเปิดลิงก์เพื่อตอบ';
const LINK_LABEL = 'เปิดงาน';
/** RFC 3676 signature separator: the footer is not part of the notice. */
const SIGNATURE = '-- ';

export function emailContent(notice: ComposedNotice): EmailContent {
  return {
    subject: `[${notice.number}] ${notice.headline}`,
    body: [`${notice.number} ${notice.headline}`, ...notice.lines, '', `${LINK_LABEL}: ${notice.link}`, '', SIGNATURE, EMAIL_FOOTER].join('\n'),
  };
}

const ADDRESS = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
/** UTF-8 bytes per encoded word: base64 of 39 bytes is 52 characters, a word 64, “Subject: ” + word 73 ≤ 78. */
const WORD_BYTES = 39;

/** RFC 2047 B-encoded words of `text`, each ≤ 64 characters, split between characters only. */
function encodedWords(text: string): string[] {
  const words: string[] = [];
  let chunk: Buffer[] = [];
  let size = 0;
  const flush = () => {
    if (chunk.length > 0) words.push(`=?UTF-8?B?${Buffer.concat(chunk).toString('base64')}?=`);
    chunk = [];
    size = 0;
  };
  for (const char of text) {
    const bytes = Buffer.from(char, 'utf8');
    if (size + bytes.length > WORD_BYTES) flush();
    chunk.push(bytes);
    size += bytes.length;
  }
  flush();
  return words;
}

/** A header whose value is encoded words, folded one word per line (`rest` on its own last line). */
function encodedHeader(name: string, text: string, rest?: string): string {
  const words = encodedWords(text.replace(/[\r\n]+/g, ' '));
  return [`${name}: ${words[0] ?? ''}`, ...words.slice(1).map((word) => ` ${word}`), ...(rest === undefined ? [] : [` ${rest}`])].join('\r\n');
}

function requireAddress(address: string, field: string): string {
  if (!ADDRESS.test(address)) throw new RangeError(`${field} must be one plain e-mail address`);
  return address;
}

/** The base64 of the body in canonical form (CRLF), in lines of 76 characters. */
function base64Body(body: string): string {
  const encoded = Buffer.from(body.replace(/\r?\n/g, '\r\n'), 'utf8').toString('base64');
  return (encoded.match(/.{1,76}/g) ?? []).join('\r\n');
}

/** One RFC 5322 message, CRLF line ends, ready for Gmail `users.messages.send` (`raw`, base64url). */
export function buildMimeMessage(input: { readonly from: MailSender; readonly to: string; readonly subject: string; readonly body: string }): string {
  const to = requireAddress(input.to, 'to');
  const from = requireAddress(input.from.address, 'from');
  return [
    encodedHeader('From', input.from.name, `<${from}>`),
    `To: ${to}`,
    encodedHeader('Subject', input.subject),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    // RFC 3834: generated automatically, so out-of-office replies are not sent back.
    'Auto-Submitted: auto-generated',
    'X-Auto-Response-Suppress: All',
    '',
    base64Body(input.body),
  ].join('\r\n');
}
