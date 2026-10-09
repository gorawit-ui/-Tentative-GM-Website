// A07 — the text of every notice (UI-15, Part 2 Addendum A1.2, C1, C3): short Thai, the request
// number, a link to the request page in the web (`/requests/:request_id`, Part 2 §routes), the date
// as on screen; one way only (no action buttons in phase A). A confidential request gets the number,
// the neutral “งานภายในมีอัปเดต” and the link — nothing else. Never a photo URL or typed text: the
// renderer only knows the fields below.
import { describe, expect, it } from 'vitest';
import { formatThaiDateTime } from '@gm/time';
import { renderNotice, type NoticeContent } from './messages';

const BASE = 'https://gm-dev.example.test';
const DUE = Date.parse('2027-01-06T16:00:00+07:00');
const base: NoticeContent = {
  eventKind: 'request_created',
  audience: 'gm',
  requestId: 'req-0427',
  requestNumber: 'GM-0427',
  confidential: false,
  summaryTitle: 'ไฟดับ — ทางเดิน · WH300',
};
const LINK = `<${BASE}/requests/req-0427|เปิดงาน>`;

const CASES: readonly [string, Partial<NoticeContent>, string][] = [
  ['new request to the assigned GM', {}, 'มีงานใหม่รอรับเรื่อง'],
  ['all GM told because the default owner is on leave', { variant: 'unassigned' }, 'ยังไม่มอบหมาย รอทีม GM รับเรื่อง'],
  ['a GM opened it on the requester’s behalf', { audience: 'requester' }, 'GM เปิดงานในชื่อคุณแล้ว ใช้เลขนี้ติดตามงาน'],
  ['accepted (requester / watcher)', { eventKind: 'request_accepted', audience: 'requester' }, 'GM รับเรื่องแล้ว'],
  ['completed, the requester confirms', { eventKind: 'request_completed', audience: 'requester', autoCloseDueAt: DUE }, 'งานเสร็จแล้ว กรุณาตรวจและยืนยัน'],
  ['completed, a watcher', { eventKind: 'request_completed', audience: 'watcher', autoCloseDueAt: DUE }, 'งานเสร็จแล้ว'],
  ['not resolved, to the assigned GM', { eventKind: 'request_not_resolved', audience: 'gm' }, 'ผู้ขอแจ้งว่ายังไม่เรียบร้อย งานกลับมาที่คุณ'],
  ['not resolved, a watcher', { eventKind: 'request_not_resolved', audience: 'watcher' }, 'ผู้ขอแจ้งว่ายังไม่เรียบร้อย งานกลับมาดำเนินการต่อ'],
  ['cancelled', { eventKind: 'request_cancelled', audience: 'requester' }, 'งานถูกยกเลิก'],
  ['reopened', { eventKind: 'request_reopened', audience: 'requester' }, 'งานถูกเปิดกลับมาดำเนินการอีกครั้ง'],
  ['taken over, to the previous GM', { eventKind: 'request_taken_over', audience: 'gm' }, 'มี GM รับงานนี้ต่อจากคุณแล้ว'],
  ['now waiting (requester / watcher)', { eventKind: 'request_waiting', audience: 'requester', waitingLabel: 'ทีมบัญชี' }, 'รอผู้อื่น: ทีมบัญชี'],
  ['waiting on you', { eventKind: 'waiting_requested', audience: 'waiting_party' }, 'รอการดำเนินการจากฝั่งคุณ'],
  ['reminder', { eventKind: 'waiting_reminder', audience: 'waiting_party' }, 'เตือนอีกครั้ง: รอการดำเนินการจากฝั่งคุณ'],
  ['the waited party answered, to the GM', { eventKind: 'waiting_party_responded', audience: 'gm' }, 'ฝ่ายที่รอตอบกลับแล้ว'],
  ['added as a related person', { eventKind: 'related_added', audience: 'related' }, 'คุณถูกเพิ่มเป็นผู้เกี่ยวข้องในงานนี้'],
];

describe('every notice kind: number, short Thai headline, public title, link', () => {
  it.each(CASES)('%s', (_label, change, headline) => {
    const notice = renderNotice({ ...base, ...change }, BASE);
    expect(notice.headline).toBe(headline);
    expect(notice.link).toBe(`${BASE}/requests/req-0427`);
    const lines = notice.text.split('\n');
    expect(lines[0]).toBe(`*GM-0427* ${headline}`);
    expect(lines).toContain('ไฟดับ — ทางเดิน · WH300');
    expect(lines[lines.length - 1]).toBe(LINK);
  });

  it('the requester’s completion notice carries the real auto-close time, written as on screen', () => {
    const notice = renderNotice({ ...base, eventKind: 'request_completed', audience: 'requester', autoCloseDueAt: DUE }, BASE);
    expect(notice.text).toContain(`ระบบจะปิดอัตโนมัติ ${formatThaiDateTime(DUE)} หากไม่มีการตอบกลับ`);
    expect(notice.text).toContain('6 ม.ค. 2570 16:00 น.');
  });

  it('waiting with no public label still says it waits', () => {
    expect(renderNotice({ ...base, eventKind: 'request_waiting', audience: 'watcher' }, BASE).headline).toBe('รอผู้อื่น');
  });

  it('a title with Slack control characters is escaped, never a link or mention', () => {
    const notice = renderNotice({ ...base, summaryTitle: 'ประตู <!channel> & <https://x.example|คลิก>' }, BASE);
    expect(notice.text).toContain('ประตู &lt;!channel&gt; &amp; &lt;https://x.example|คลิก&gt;');
    expect(notice.text).not.toContain('<!channel>');
  });

  it('an unknown kind is refused rather than sent with a made-up text', () => {
    expect(() => renderNotice({ ...base, eventKind: 'something_new' }, BASE)).toThrow(/no template/);
  });
});

describe('confidential (C3, UI-15): number + “งานภายในมีอัปเดต” + link, nothing else', () => {
  it.each(CASES)('%s', (_label, change) => {
    const notice = renderNotice({ ...base, ...change, confidential: true }, BASE);
    expect(notice.text).toBe(`*GM-0427* งานภายในมีอัปเดต\n${LINK}`);
    expect(notice.headline).toBe('งานภายในมีอัปเดต');
  });
});

describe('the link base is configurable (the real domain waits for P7-INFRA-01)', () => {
  it('uses the configured base, with or without a trailing slash; the request ID is encoded', () => {
    expect(renderNotice(base, 'http://localhost:5173/').link).toBe('http://localhost:5173/requests/req-0427');
    expect(renderNotice({ ...base, requestId: 'req a/b' }, 'https://gm.example.test').link).toBe('https://gm.example.test/requests/req%20a%2Fb');
  });
});
