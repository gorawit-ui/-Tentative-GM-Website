// A07 / D-A07-1 — the text of every notice (UI-15, Part 2 Addendum A1.2, C1, C3): short Thai, the
// request number, a link to the request page in the web (`/requests/:request_id`, Part 2 §routes), the
// date as on screen (D-A07-2); one way only (no action buttons in phase A), so a notice that asks for
// something says which button on the linked page to press. D-A07-3: the public board title of every
// general request. A confidential request gets the number, a neutral line per kind that still says
// what to do, the instruction and the link — never the title, a note, a name or an outside party.
// Never a photo URL or typed description: the renderer only knows the fields below.
import { describe, expect, it } from 'vitest';
import { formatThaiDateTime } from '@gm/time';
import { composeNotice, renderNotice, type NoticeContent } from './messages';

const BASE = 'https://gm-dev.example.test';
const DUE = Date.parse('2027-01-06T16:00:00+07:00');
const TITLE = 'ไฟดับ — ทางเดิน · WH300';
const base: NoticeContent = {
  eventKind: 'request_created',
  audience: 'gm',
  requestId: 'req-0427',
  requestNumber: 'GM-0427',
  confidential: false,
  summaryTitle: TITLE,
};
const LINK = `<${BASE}/requests/req-0427|เปิดงาน>`;
const ANSWER = 'ทำเสร็จแล้ว กด “ฝั่งฉันเรียบร้อยแล้ว” ในลิงก์';
const NOT_RESOLVED = 'ถ้ายังไม่เรียบร้อย กด “ยังไม่เรียบร้อย” ในลิงก์';
const AUTO_CLOSE = `ระบบจะปิดอัตโนมัติ ${formatThaiDateTime(DUE)} หากไม่มีการตอบกลับ`;
const GM_NOTE = 'ขอใบเสนอราคา 2 ร้าน ภายในวันศุกร์';
const REPLY_NOTE = 'ส่งใบเสนอราคาให้แล้วทางอีเมล';

/** [label, change, headline, lines between the title and the link]. */
const CASES: readonly [string, Partial<NoticeContent>, string, readonly string[]][] = [
  ['new request to the assigned GM', {}, 'มีงานใหม่รอรับเรื่อง', []],
  ['all GM told because the default owner is on leave', { variant: 'unassigned' }, 'ยังไม่มอบหมาย รอทีม GM รับเรื่อง', []],
  ['a GM opened it on the requester’s behalf', { audience: 'requester' }, 'GM เปิดงานในชื่อคุณแล้ว ใช้เลขนี้ติดตามงาน', []],
  ['accepted (requester / watcher)', { eventKind: 'request_accepted', audience: 'requester' }, 'GM รับเรื่องแล้ว', []],
  [
    'completed, the requester confirms',
    { eventKind: 'request_completed', audience: 'requester', autoCloseDueAt: DUE },
    'งานเสร็จแล้ว กรุณาตรวจและยืนยัน',
    [AUTO_CLOSE, NOT_RESOLVED],
  ],
  ['completed, a watcher (no auto-close time, D-A07-7)', { eventKind: 'request_completed', audience: 'watcher', autoCloseDueAt: DUE }, 'งานเสร็จแล้ว', []],
  ['not resolved, to the assigned GM', { eventKind: 'request_not_resolved', audience: 'gm' }, 'ผู้ขอแจ้งว่ายังไม่เรียบร้อย งานกลับมาที่คุณ', []],
  ['not resolved, a watcher', { eventKind: 'request_not_resolved', audience: 'watcher' }, 'ผู้ขอแจ้งว่ายังไม่เรียบร้อย งานกลับมาดำเนินการต่อ', []],
  ['cancelled', { eventKind: 'request_cancelled', audience: 'requester' }, 'งานถูกยกเลิก', []],
  ['reopened', { eventKind: 'request_reopened', audience: 'requester' }, 'งานถูกเปิดกลับมาดำเนินการอีกครั้ง', []],
  ['taken over, to the previous GM: who took it', { eventKind: 'request_taken_over', audience: 'gm', actorName: 'ป๊อป' }, 'ป๊อป รับงานนี้ต่อจากคุณแล้ว', []],
  ['now waiting (requester / watcher)', { eventKind: 'request_waiting', audience: 'requester', waitingLabel: 'ทีมบัญชี' }, 'กำลังรอทีมบัญชีดำเนินการ', []],
  [
    'waiting on you: the GM who waits, the GM’s note, how to answer',
    { eventKind: 'waiting_requested', audience: 'waiting_party', actorName: 'ป๊อป', waitingNote: GM_NOTE },
    'ป๊อป (ทีม GM) รอการดำเนินการจากคุณ',
    [`หมายเหตุ: ${GM_NOTE}`, ANSWER],
  ],
  [
    'reminder: the same, marked as a reminder',
    { eventKind: 'waiting_reminder', audience: 'waiting_party', actorName: 'ป๊อป', waitingNote: GM_NOTE },
    'เตือนอีกครั้ง: ป๊อป (ทีม GM) รอการดำเนินการจากคุณ',
    [`หมายเหตุ: ${GM_NOTE}`, ANSWER],
  ],
  [
    'the waited party answered, to the GM: who answered and their note',
    { eventKind: 'waiting_party_responded', audience: 'gm', responderLabel: 'สมชาย (ทีมบัญชี)', responseNote: REPLY_NOTE },
    'สมชาย (ทีมบัญชี) ตอบกลับแล้ว',
    [`หมายเหตุ: ${REPLY_NOTE}`],
  ],
  ['added as a related person: by whom', { eventKind: 'related_added', audience: 'related', actorName: 'ป๊อป' }, 'ป๊อป (ทีม GM) เพิ่มคุณเป็นผู้เกี่ยวข้องในงานนี้', []],
];

describe('every notice kind: number, short Thai headline, public title, what to do, link', () => {
  it.each(CASES)('%s', (_label, change, headline, extra) => {
    const notice = renderNotice({ ...base, ...change }, BASE);
    expect(notice.headline).toBe(headline);
    expect(notice.link).toBe(`${BASE}/requests/req-0427`);
    // Short: number + headline, the board title (D-A07-3), what the kind adds, the link — nothing else.
    expect(notice.text).toBe([`*GM-0427* ${headline}`, TITLE, ...extra, LINK].join('\n'));
  });

  it('the requester’s completion notice carries the real auto-close time, written as on screen (D-A07-2)', () => {
    const notice = renderNotice({ ...base, eventKind: 'request_completed', audience: 'requester', autoCloseDueAt: DUE }, BASE);
    expect(notice.text).toContain('ระบบจะปิดอัตโนมัติ 6 ม.ค. 2570 16:00 น. หากไม่มีการตอบกลับ');
  });

  it('no name / label / note known → the plain line of the kind, no empty brackets or “หมายเหตุ:”', () => {
    const plain = (change: Partial<NoticeContent>) => renderNotice({ ...base, ...change }, BASE).text;
    expect(plain({ eventKind: 'waiting_requested', audience: 'waiting_party' })).toBe(['*GM-0427* รอการดำเนินการจากฝั่งคุณ', TITLE, ANSWER, LINK].join('\n'));
    expect(plain({ eventKind: 'waiting_reminder', audience: 'waiting_party' }).split('\n')[0]).toBe('*GM-0427* เตือนอีกครั้ง: รอการดำเนินการจากฝั่งคุณ');
    expect(plain({ eventKind: 'request_waiting', audience: 'watcher' }).split('\n')[0]).toBe('*GM-0427* กำลังรอผู้อื่นดำเนินการ');
    expect(plain({ eventKind: 'request_taken_over', audience: 'gm' }).split('\n')[0]).toBe('*GM-0427* มี GM รับงานนี้ต่อจากคุณแล้ว');
    expect(plain({ eventKind: 'related_added', audience: 'related' }).split('\n')[0]).toBe('*GM-0427* คุณถูกเพิ่มเป็นผู้เกี่ยวข้องในงานนี้');
    expect(plain({ eventKind: 'waiting_party_responded', audience: 'gm' })).toBe(['*GM-0427* ฝ่ายที่รอตอบกลับแล้ว', TITLE, LINK].join('\n'));
    expect(plain({ eventKind: 'waiting_requested', audience: 'waiting_party', waitingNote: '   ' })).not.toContain('หมายเหตุ');
  });

  it('a note is shown up to 200 characters, on one line', () => {
    const long = `${'ก'.repeat(150)}\n${'ข'.repeat(150)}`;
    const line = renderNotice({ ...base, eventKind: 'waiting_requested', audience: 'waiting_party', waitingNote: long }, BASE).text.split('\n')[2] ?? '';
    const note = line.replace('หมายเหตุ: ', '');
    expect([...note]).toHaveLength(200);
    expect(note.endsWith('…')).toBe(true);
    expect(note.startsWith(`${'ก'.repeat(150)} ข`)).toBe(true);
    const reply = renderNotice({ ...base, eventKind: 'waiting_party_responded', audience: 'gm', responseNote: 'ค'.repeat(201) }, BASE).text.split('\n')[2] ?? '';
    expect([...reply.replace('หมายเหตุ: ', '')]).toHaveLength(200);
  });

  it('a title, name or note with Slack control characters is escaped, never a link or mention', () => {
    const notice = renderNotice(
      { ...base, eventKind: 'waiting_requested', audience: 'waiting_party', summaryTitle: 'ประตู <!channel> & <https://x.example|คลิก>', actorName: '<@U0BAD>', waitingNote: '<!here>' },
      BASE,
    );
    expect(notice.text).toContain('ประตู &lt;!channel&gt; &amp; &lt;https://x.example|คลิก&gt;');
    expect(notice.text).toContain('&lt;@U0BAD&gt; (ทีม GM)');
    expect(notice.text).toContain('หมายเหตุ: &lt;!here&gt;');
    expect(notice.text).not.toMatch(/<!channel>|<!here>|<@U0BAD>/);
  });

  it('a long board title is cut so the message stays short', () => {
    const notice = renderNotice({ ...base, summaryTitle: 'ก'.repeat(150) }, BASE);
    expect(notice.text.split('\n')[1]).toBe(`${'ก'.repeat(99)}…`);
  });

  it('an unknown kind is refused rather than sent with a made-up text', () => {
    expect(() => renderNotice({ ...base, eventKind: 'something_new' }, BASE)).toThrow(/no template/);
  });

  it('composeNotice gives the plain parts (no Slack markup) for e-mail (A08)', () => {
    const notice = composeNotice({ ...base, eventKind: 'waiting_requested', audience: 'waiting_party', actorName: 'ป๊อป & ทีม', waitingNote: GM_NOTE }, BASE);
    expect(notice).toEqual({
      number: 'GM-0427',
      headline: 'ป๊อป & ทีม (ทีม GM) รอการดำเนินการจากคุณ',
      lines: [TITLE, `หมายเหตุ: ${GM_NOTE}`, ANSWER],
      link: `${BASE}/requests/req-0427`,
    });
  });
});

describe('D-A08-5: a button name is quoted “ ” as on the screen, so people find the button by its words', () => {
  it.each([
    ['waiting on you', { eventKind: 'waiting_requested', audience: 'waiting_party' }, '“ฝั่งฉันเรียบร้อยแล้ว”'],
    ['reminder', { eventKind: 'waiting_reminder', audience: 'waiting_party' }, '“ฝั่งฉันเรียบร้อยแล้ว”'],
    ['completed, to the requester', { eventKind: 'request_completed', audience: 'requester', autoCloseDueAt: DUE }, '“ยังไม่เรียบร้อย”'],
  ] as const)('%s', (_label, change, button) => {
    for (const confidential of [false, true]) {
      const notice = composeNotice({ ...base, ...change, confidential }, BASE);
      expect(notice.lines.filter((line) => line.includes(` กด ${button} ในลิงก์`))).toHaveLength(1);
      expect(notice.lines.join('\n')).not.toContain("'");
    }
  });
});

/** D-A07-1: [label, change, the whole confidential message]. */
const CONFIDENTIAL: readonly [string, Partial<NoticeContent>, readonly string[]][] = [
  ['new request', {}, ['มีงานใหม่รอรับเรื่อง']],
  ['unassigned', { variant: 'unassigned' }, ['ยังไม่มอบหมาย รอทีม GM รับเรื่อง']],
  ['opened on behalf', { audience: 'requester' }, ['GM เปิดงานในชื่อคุณแล้ว ใช้เลขนี้ติดตามงาน']],
  ['accepted', { eventKind: 'request_accepted', audience: 'requester' }, ['GM รับเรื่องแล้ว']],
  [
    'completed: what to do and when it closes by itself',
    { eventKind: 'request_completed', audience: 'requester', autoCloseDueAt: DUE },
    ['งานเสร็จแล้ว กรุณาตรวจและยืนยัน', AUTO_CLOSE, NOT_RESOLVED],
  ],
  ['not resolved', { eventKind: 'request_not_resolved', audience: 'gm' }, ['ผู้ขอแจ้งว่ายังไม่เรียบร้อย งานกลับมาที่คุณ']],
  ['cancelled', { eventKind: 'request_cancelled', audience: 'requester' }, ['งานถูกยกเลิก']],
  ['reopened', { eventKind: 'request_reopened', audience: 'requester' }, ['งานถูกเปิดกลับมาดำเนินการอีกครั้ง']],
  ['taken over: no name', { eventKind: 'request_taken_over', audience: 'gm', actorName: 'ป๊อป' }, ['มี GM รับงานนี้ต่อจากคุณแล้ว']],
  ['waiting: no outside party', { eventKind: 'request_waiting', audience: 'requester', waitingLabel: 'สำนักงานเขตบางนา' }, ['กำลังรอผู้อื่นดำเนินการ']],
  [
    'waiting on you: no name, no note, still how to answer',
    { eventKind: 'waiting_requested', audience: 'waiting_party', actorName: 'ป๊อป', waitingNote: GM_NOTE },
    ['รอการดำเนินการจากฝั่งคุณ', ANSWER],
  ],
  ['reminder', { eventKind: 'waiting_reminder', audience: 'waiting_party', actorName: 'ป๊อป', waitingNote: GM_NOTE }, ['เตือนอีกครั้ง: รอการดำเนินการจากฝั่งคุณ', ANSWER]],
  ['answered: no name, no note', { eventKind: 'waiting_party_responded', audience: 'gm', responderLabel: 'สมชาย (ทีมบัญชี)', responseNote: REPLY_NOTE }, ['ฝ่ายที่รอตอบกลับแล้ว']],
  ['added as related: no name', { eventKind: 'related_added', audience: 'related', actorName: 'ป๊อป' }, ['คุณถูกเพิ่มเป็นผู้เกี่ยวข้องในงานนี้']],
];

describe('confidential (C3, D-A07-1): number + the neutral line of the kind + what to do + link — never title, note, name or party', () => {
  it.each(CONFIDENTIAL)('%s', (_label, change, lines) => {
    const notice = renderNotice({ ...base, ...change, confidential: true }, BASE);
    const [headline, ...rest] = lines;
    expect(notice.text).toBe([`*GM-0427* ${headline}`, ...rest, LINK].join('\n'));
    expect(notice.headline).toBe(headline);
    for (const secret of [TITLE, GM_NOTE, REPLY_NOTE, 'ป๊อป', 'สมชาย', 'ทีมบัญชี', 'สำนักงานเขต']) expect(notice.text).not.toContain(secret);
  });

  it('every kind has a confidential line (none falls back to the general text)', () => {
    expect(CONFIDENTIAL.map(([, change]) => `${change.eventKind ?? 'request_created'}/${change.audience ?? 'gm'}/${change.variant ?? ''}`)).toHaveLength(14);
  });
});

describe('the link base is configurable (the real domain waits for P7-INFRA-01)', () => {
  it('uses the configured base, with or without a trailing slash; the request ID is encoded', () => {
    expect(renderNotice(base, 'http://localhost:5173/').link).toBe('http://localhost:5173/requests/req-0427');
    expect(renderNotice({ ...base, requestId: 'req a/b' }, 'https://gm.example.test').link).toBe('https://gm.example.test/requests/req%20a%2Fb');
  });
});
