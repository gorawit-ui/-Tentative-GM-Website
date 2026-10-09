// A07 / D-A07-1 — the text of every notice (UI-15, Part 2 Addendum A1.2, C1, C3, Part 3 §1). Phase A
// is one way: a short Thai line with the request number, the public board title of a general request
// (D-A07-3), what the kind adds (who acted, the GM's or the waited party's note, the real auto-close
// time) and which button on the linked page to press, then a link to the request page in the web
// (`/requests/:id`) — no action buttons. A confidential request gets the number, the neutral line of
// its kind, the instruction and the link: never the title, a note, a person's name or an outside
// party. The renderer only receives the fields below, so the typed description, comments, photos,
// signed URLs and GM-only notes cannot reach a message. Pure: no I/O, no clock.
// `composeNotice` gives the plain parts (Slack and e-mail, A08); `renderNotice` the Slack mrkdwn.
import { formatThaiDateTime } from '@gm/time';
import type { OutboundMessage } from './adapters';

export interface NoticeContent {
  readonly eventKind: string;
  readonly audience: OutboundMessage['audience'];
  readonly requestId: string;
  readonly requestNumber: string;
  /** True when the request is confidential now or was when the notice was queued (C3). */
  readonly confidential: boolean;
  /** The public board title (`summary_title`, U2, D-A07-3); never shown for a confidential request. */
  readonly summaryTitle?: string;
  /** `request_completed` to the requester: the real auto-close time (UI-15). */
  readonly autoCloseDueAt?: number;
  /** `request_waiting`: the public label of who the request waits on (D-S09-1), never a name. */
  readonly waitingLabel?: string;
  /** `unassigned`: the all-GM notice of a request no one was assigned (A3, UI-15). */
  readonly variant?: 'unassigned';
  /** D-A07-1: the GM who asked / reminded / took over / added (general requests only). */
  readonly actorName?: string;
  /** D-A07-1: the GM's note when entering waiting, to the waited party (general requests only). */
  readonly waitingNote?: string;
  /** D-A07-1: who answered, e.g. “สมชาย (ทีมบัญชี)”, to the GM (general requests only). */
  readonly responderLabel?: string;
  /** D-A07-1: the waited party's note with the answer (general requests only). */
  readonly responseNote?: string;
}

/** The plain parts of a notice; each channel lays them out (Slack mrkdwn, e-mail subject + body). */
export interface ComposedNotice {
  readonly number: string;
  /** The short Thai line after the number. */
  readonly headline: string;
  /** Between the headline and the link: title, note, auto-close time, what to press. */
  readonly lines: readonly string[];
  readonly link: string;
}

export interface RenderedNotice {
  readonly headline: string;
  readonly link: string;
  /** Slack mrkdwn. */
  readonly text: string;
}

const LINK_LABEL = 'เปิดงาน';
/** A long board title is cut so the message stays short. */
const MAX_TITLE_CHARS = 100;
/** D-A07-1: a note is shown up to 200 characters. */
const MAX_NOTE_CHARS = 200;
/** D-A08-5: the button's name quoted “ ” as on the screen, so people find it by its words. */
const ANSWER_LINE = 'ทำเสร็จแล้ว กด “ฝั่งฉันเรียบร้อยแล้ว” ในลิงก์';
const NOT_RESOLVED_LINE = 'ถ้ายังไม่เรียบร้อย กด “ยังไม่เรียบร้อย” ในลิงก์';

/** Whitespace collapsed to one line, cut to `max` characters (the last one “…” when cut). */
function oneLine(value: string | undefined, max: number): string | undefined {
  const trimmed = value?.replace(/\s+/g, ' ').trim();
  if (trimmed === undefined || trimmed === '') return undefined;
  const chars = [...trimmed];
  return chars.length <= max ? trimmed : `${chars.slice(0, max - 1).join('')}…`;
}

const asked = (name: string | undefined) => (name === undefined ? 'รอการดำเนินการจากฝั่งคุณ' : `${name} (ทีม GM) รอการดำเนินการจากคุณ`);

function headlineOf(notice: NoticeContent): string | undefined {
  const name = oneLine(notice.actorName, MAX_TITLE_CHARS);
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
      // D-A03-4: to the previous assignee; D-A07-1: who took it.
      return name === undefined ? 'มี GM รับงานนี้ต่อจากคุณแล้ว' : `${name} รับงานนี้ต่อจากคุณแล้ว`;
    case 'request_waiting':
      return `กำลังรอ${oneLine(notice.waitingLabel, MAX_TITLE_CHARS) ?? 'ผู้อื่น'}ดำเนินการ`;
    case 'waiting_requested':
      return asked(name);
    case 'waiting_reminder':
      return `เตือนอีกครั้ง: ${asked(name)}`;
    case 'waiting_party_responded': {
      const responder = oneLine(notice.responderLabel, MAX_TITLE_CHARS);
      return responder === undefined ? 'ฝ่ายที่รอตอบกลับแล้ว' : `${responder} ตอบกลับแล้ว`;
    }
    case 'related_added':
      return name === undefined ? 'คุณถูกเพิ่มเป็นผู้เกี่ยวข้องในงานนี้' : `${name} (ทีม GM) เพิ่มคุณเป็นผู้เกี่ยวข้องในงานนี้`;
    default:
      return undefined;
  }
}

/** What the kind adds after the title: a note, the auto-close time, the button to press. */
function linesOf(notice: NoticeContent): string[] {
  const lines: string[] = [];
  const note = (value: string | undefined) => {
    const shown = oneLine(value, MAX_NOTE_CHARS);
    if (shown !== undefined) lines.push(`หมายเหตุ: ${shown}`);
  };
  switch (notice.eventKind) {
    case 'waiting_requested':
    case 'waiting_reminder':
      note(notice.waitingNote);
      lines.push(ANSWER_LINE);
      break;
    case 'waiting_party_responded':
      note(notice.responseNote);
      break;
    case 'request_completed':
      if (notice.audience === 'requester') {
        if (notice.autoCloseDueAt !== undefined) lines.push(`ระบบจะปิดอัตโนมัติ ${formatThaiDateTime(notice.autoCloseDueAt)} หากไม่มีการตอบกลับ`);
        lines.push(NOT_RESOLVED_LINE);
      }
      break;
    default:
      break;
  }
  return lines;
}

/** C3 / D-A07-1: what a confidential notice may never carry, removed before anything is worded. */
function withoutPrivateParts(notice: NoticeContent): NoticeContent {
  const { summaryTitle: _title, waitingLabel: _label, actorName: _actor, waitingNote: _note, responderLabel: _responder, responseNote: _reply, ...rest } = notice;
  return rest;
}

/** `{base}/requests/{id}` — the request page in the web (Part 2 routes); the base is configured. */
export function requestLink(webBaseUrl: string, requestId: string): string {
  return `${webBaseUrl.replace(/\/+$/, '')}/requests/${encodeURIComponent(requestId)}`;
}

export function composeNotice(content: NoticeContent, webBaseUrl: string): ComposedNotice {
  const notice = content.confidential ? withoutPrivateParts(content) : content;
  const headline = headlineOf(notice);
  if (headline === undefined) throw new RangeError(`no template for event kind ${JSON.stringify(notice.eventKind)}`);
  const title = oneLine(notice.summaryTitle, MAX_TITLE_CHARS);
  return {
    number: notice.requestNumber,
    headline,
    lines: [...(title === undefined ? [] : [title]), ...linesOf(notice)],
    link: requestLink(webBaseUrl, notice.requestId),
  };
}

/** Slack control characters (`&`, `<`, `>`), so text can never become a link or a mention. */
function escapeSlack(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/** Slack mrkdwn: `*number* headline`, the lines, `<link|เปิดงาน>`. */
export function slackText(notice: ComposedNotice): string {
  return [`*${escapeSlack(notice.number)}* ${escapeSlack(notice.headline)}`, ...notice.lines.map(escapeSlack), `<${notice.link}|${LINK_LABEL}>`].join('\n');
}

export function renderNotice(content: NoticeContent, webBaseUrl: string): RenderedNotice {
  const notice = composeNotice(content, webBaseUrl);
  return { headline: notice.headline, link: notice.link, text: slackText(notice) };
}
