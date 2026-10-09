// A07 — the text of every notice (UI-15, Part 2 Addendum A1.2, C1, C3, Part 3 §1). Phase A is one way:
// a short Thai line with the request number, the public board title of a general request, the real
// auto-close time where it matters, and a link to the request page in the web (`/requests/:id`) —
// no action buttons. A confidential request gets the number, the neutral “งานภายในมีอัปเดต” and the
// link, nothing else. The renderer only receives the fields below, so the typed description, comments,
// photos, signed URLs, names and GM-only notes cannot reach a message. Pure: no I/O, no clock.
import { formatThaiDateTime } from '@gm/time';
import type { OutboundMessage } from './adapters';

export interface NoticeContent {
  readonly eventKind: string;
  readonly audience: OutboundMessage['audience'];
  readonly requestId: string;
  readonly requestNumber: string;
  /** True when the request is confidential now or was when the notice was queued (C3). */
  readonly confidential: boolean;
  /** The public board title (`summary_title`, U2); never set for a confidential request. */
  readonly summaryTitle?: string;
  /** `request_completed` to the requester: the real auto-close time (UI-15). */
  readonly autoCloseDueAt?: number;
  /** `request_waiting`: the public label of who the request waits on (D-S09-1), never a name. */
  readonly waitingLabel?: string;
  /** `unassigned`: the all-GM notice of a request no one was assigned (A3, UI-15). */
  readonly variant?: 'unassigned';
}

export interface RenderedNotice {
  /** The short Thai line after the number (plain text). */
  readonly headline: string;
  readonly link: string;
  /** Slack mrkdwn; e-mail (A08) can reuse headline and link. */
  readonly text: string;
}

/** UI-15 / C3: the only words a confidential notice may carry besides the number and the link. */
export const CONFIDENTIAL_HEADLINE = 'งานภายในมีอัปเดต';
const LINK_LABEL = 'เปิดงาน';
/** A long board title is cut so the message stays short. */
const MAX_TITLE_CHARS = 100;

function headlineOf(notice: NoticeContent): string | undefined {
  switch (notice.eventKind) {
    case 'request_created':
      if (notice.variant === 'unassigned') return 'ยังไม่มอบหมาย รอทีม GM รับเรื่อง';
      // D-A01-4: a GM opened the request on the requester's behalf.
      return notice.audience === 'requester' ? 'GM เปิดงานในชื่อคุณแล้ว ใช้เลขนี้ติดตามงาน' : 'มีงานใหม่รอรับเรื่อง';
    case 'request_accepted':
      return 'GM รับเรื่องแล้ว';
    case 'request_completed':
      return notice.audience === 'requester' ? 'งานเสร็จแล้ว กรุณาตรวจและยืนยัน' : 'งานเสร็จแล้ว';
    case 'request_not_resolved':
      // D-A03-2: the assigned GM gets the request back.
      return notice.audience === 'gm' ? 'ผู้ขอแจ้งว่ายังไม่เรียบร้อย งานกลับมาที่คุณ' : 'ผู้ขอแจ้งว่ายังไม่เรียบร้อย งานกลับมาดำเนินการต่อ';
    case 'request_cancelled':
      return 'งานถูกยกเลิก';
    case 'request_reopened':
      return 'งานถูกเปิดกลับมาดำเนินการอีกครั้ง';
    case 'request_taken_over':
      // D-A03-4: to the previous assignee.
      return 'มี GM รับงานนี้ต่อจากคุณแล้ว';
    case 'request_waiting': {
      const label = notice.waitingLabel?.trim();
      return label === undefined || label === '' ? 'รอผู้อื่น' : `รอผู้อื่น: ${label}`;
    }
    case 'waiting_requested':
      return 'รอการดำเนินการจากฝั่งคุณ';
    case 'waiting_reminder':
      return 'เตือนอีกครั้ง: รอการดำเนินการจากฝั่งคุณ';
    case 'waiting_party_responded':
      return 'ฝ่ายที่รอตอบกลับแล้ว';
    case 'related_added':
      return 'คุณถูกเพิ่มเป็นผู้เกี่ยวข้องในงานนี้';
    default:
      return undefined;
  }
}

/** Slack control characters (`&`, `<`, `>`), so a title can never become a link or a mention. */
function escapeSlack(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function shortTitle(title: string | undefined): string | undefined {
  const trimmed = title?.replace(/\s+/g, ' ').trim();
  if (trimmed === undefined || trimmed === '') return undefined;
  const chars = [...trimmed];
  return chars.length <= MAX_TITLE_CHARS ? trimmed : `${chars.slice(0, MAX_TITLE_CHARS - 1).join('')}…`;
}

/** `{base}/requests/{id}` — the request page in the web (Part 2 routes); the base is configured. */
export function requestLink(webBaseUrl: string, requestId: string): string {
  return `${webBaseUrl.replace(/\/+$/, '')}/requests/${encodeURIComponent(requestId)}`;
}

export function renderNotice(notice: NoticeContent, webBaseUrl: string): RenderedNotice {
  const headline = headlineOf(notice);
  if (headline === undefined) throw new RangeError(`no template for event kind ${JSON.stringify(notice.eventKind)}`);
  const link = requestLink(webBaseUrl, notice.requestId);
  const number = `*${escapeSlack(notice.requestNumber)}*`;
  const linkLine = `<${link}|${LINK_LABEL}>`;
  if (notice.confidential) return { headline: CONFIDENTIAL_HEADLINE, link, text: `${number} ${CONFIDENTIAL_HEADLINE}\n${linkLine}` };
  const lines = [`${number} ${escapeSlack(headline)}`];
  const title = shortTitle(notice.summaryTitle);
  if (title !== undefined) lines.push(escapeSlack(title));
  if (notice.eventKind === 'request_completed' && notice.audience === 'requester' && notice.autoCloseDueAt !== undefined) {
    lines.push(`ระบบจะปิดอัตโนมัติ ${formatThaiDateTime(notice.autoCloseDueAt)} หากไม่มีการตอบกลับ`);
  }
  lines.push(linkLine);
  return { headline, link, text: lines.join('\n') };
}
