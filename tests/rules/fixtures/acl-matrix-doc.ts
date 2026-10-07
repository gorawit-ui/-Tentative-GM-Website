// Renders docs/spec/ACL-MATRIX.md from the ACL matrix fixture so people can review the policy. The
// file is generated (`npm run docs:acl-matrix`) and `acl-matrix-doc.test.ts` fails when it drifts.
import {
  ACL_OPERATIONS,
  ACTIVE_SUBJECTS,
  RESOURCES,
  SUBJECTS,
  SUBJECT_KEYS,
  decide,
  matrixCells,
  resourcePattern,
  type AclOperation,
  type AclResource,
  type SubjectKey,
} from './acl-matrix';

export const ACL_MATRIX_DOC_PATH = 'docs/spec/ACL-MATRIX.md';

const READS: readonly AclOperation[] = ['get', 'list'];
const WRITES: readonly AclOperation[] = ['create', 'update', 'delete'];

const allowed = (key: SubjectKey, resource: AclResource, operations: readonly AclOperation[]) =>
  operations.filter((operation) => decide(key, resource.key, operation) === 'allow');

const code = (text: string) => `\`${text}\``;
const cell = (operations: readonly AclOperation[]) => (operations.length === 0 ? '—' : operations.join(', '));
const yes = (allow: boolean) => (allow ? 'ได้' : 'ไม่ได้');

type Row = { readonly resource: AclResource; readonly reads: readonly AclOperation[]; readonly writes: readonly AclOperation[] };

function rowsFor(key: SubjectKey): Row[] {
  return RESOURCES.map((resource) => ({ resource, reads: allowed(key, resource, READS), writes: allowed(key, resource, WRITES) })).filter(
    (row) => row.reads.length > 0 || row.writes.length > 0,
  );
}

const sameOperations = (a: Row, b: Row) => a.reads.join() === b.reads.join() && a.writes.join() === b.writes.join();

/** What every active account may do identically: shown once instead of under every role. */
export function baselineRows(): Row[] {
  const [first, ...others] = ACTIVE_SUBJECTS;
  if (first === undefined) return [];
  return rowsFor(first).filter((row) =>
    others.every((key) => rowsFor(key).some((other) => other.resource.key === row.resource.key && sameOperations(other, row))),
  );
}

function table(rows: readonly Row[]): string[] {
  return [
    '| Collection / path | อ่าน | เขียน | เงื่อนไข |',
    '|---|---|---|---|',
    ...rows.map(({ resource, reads, writes }) => `| ${code(resourcePattern(resource))} | ${cell(reads)} | ${cell(writes)} | ${resource.description} |`),
  ];
}

function roleSection(key: SubjectKey, baseline: readonly Row[]): string[] {
  const subject = SUBJECTS[key];
  const lines = [`### ${subject.description} (${code(key)})`, ''];
  const active = ACTIVE_SUBJECTS.includes(key);
  const rows = rowsFor(key).filter((row) => !active || !baseline.some((base) => base.resource.key === row.resource.key && sameOperations(base, row)));
  if (!active && rows.length === 0) return [...lines, 'ไม่มีสิทธิ์อ่านหรือเขียนอะไรเลย — ปฏิเสธทั้งหมด', ''];
  if (!active) return [...lines, 'ไม่ได้สิทธิ์พื้นฐาน ได้เฉพาะ:', '', ...table(rows), ''];
  if (rows.length === 0) return [...lines, 'ได้เฉพาะสิทธิ์พื้นฐาน ไม่มีอะไรเพิ่ม', ''];
  return [...lines, 'สิทธิ์พื้นฐาน และเพิ่ม:', '', ...table(rows), ''];
}

const byKey = (key: string): AclResource => {
  const resource = RESOURCES.find((candidate) => candidate.key === key);
  if (resource === undefined) throw new Error(`no resource ${key}`);
  return resource;
};

function confidentialSection(): string[] {
  const lines = [
    '## งานลับ — ใครเห็นอะไรได้บ้าง',
    '',
    `งานลับไม่มี ${code('request_summaries/{id}')} เลย (C6, C11) คนทั่วไปเห็นเพียงตัวเลข “งานภายใน X รายการ” จาก ${code('board_counters/public')} ซึ่งนับเฉพาะงานลับที่ยังเปิด (D-S09-4) ไม่มีชื่อ เลขงาน หรือ ID`,
    '',
    '| Role | รายละเอียด `requests/{id}` | สรุปของ GM | รายชื่อ watcher / หมายเหตุธงลับ | ตัวเลข “งานภายใน” |',
    '|---|---|---|---|---|',
  ];
  for (const key of SUBJECT_KEYS) {
    lines.push(
      `| ${SUBJECTS[key].description} (${code(key)}) | ${yes(decide(key, 'requests.confidential', 'get') === 'allow')} | ${yes(
        decide(key, 'gm_request_summaries', 'get') === 'allow',
      )} | ${yes(decide(key, 'gm_request_details', 'get') === 'allow')} | ${yes(decide(key, 'board_counters', 'get') === 'allow')} |`,
    );
  }
  return [...lines, ''];
}

function watcherSection(): string[] {
  const reads = RESOURCES.map((resource) => ({ resource, reads: allowed('watcher', resource, READS) })).filter((row) => row.reads.length > 0);
  const lines = [
    '## Watcher — เห็นอะไรได้บ้าง',
    '',
    'watcher คือคนที่กด “แจ้งปัญหาเดียวกัน” กับงานแจ้งซ่อมที่ไม่ลับ (U1) ได้เพียงสรุปสาธารณะ ไม่ได้สิทธิ์รายละเอียด',
    '',
    'อ่านได้:',
    '',
    ...reads.map(({ resource, reads: operations }) => `- ${code(resourcePattern(resource))} (${operations.join(', ')}) — ${resource.description}`),
    '',
    'อ่านไม่ได้ (ตัวอย่างที่เกี่ยวกับงานที่ติดตาม):',
    '',
  ];
  for (const key of ['requests.general', 'requests.history', 'requests.comments', 'gm_request_summaries', 'gm_request_details']) {
    const resource = byKey(key);
    if (decide('watcher', key, 'get') === 'deny') lines.push(`- ${code(resourcePattern(resource))} — ${resource.description}`);
  }
  lines.push(
    '',
    `จำนวน “มีผู้แจ้งเพิ่ม X คน” อยู่ใน ${code('request_summaries/{id}')} เป็นตัวเลข ${code('watcher_count')} เท่านั้น รายชื่อ watcher อยู่ใน ${code('gm_request_details/{id}')} ที่ GM อ่านได้คนเดียว (D-S09-5)`,
    '',
  );
  return lines;
}

/** The whole document; deterministic (no dates or counts that change by themselves). */
export function renderAclMatrixMarkdown(): string {
  const cells = matrixCells();
  const baseline = baselineRows();
  const allowedCount = cells.filter((entry) => entry.expected === 'allow').length;
  const lines = [
    '# ACL matrix — ใครอ่าน/เขียนอะไรใน Firestore ได้ (client)',
    '',
    `> ไฟล์นี้สร้างอัตโนมัติจาก ${code('tests/rules/fixtures/acl-matrix.ts')} ด้วย ${code('npm run docs:acl-matrix')} — ห้ามแก้ด้วยมือ; ${code('tests/rules/fixtures/acl-matrix-doc.test.ts')} ตรวจว่าเอกสารตรงกับ fixture เสมอ และ Rules tests (S10–S11) ใช้ fixture ชุดเดียวกัน`,
    '',
    'ที่มา: Part 6 §6.4/§6.5, C3, C4, C6, U1, A2, D-S06-4, D-S08-4, D-S09-1 ถึง D-S09-8',
    '',
    '## หลักการ',
    '',
    '- เอกสารนี้แสดง **เฉพาะสิ่งที่อนุญาต** ทุกอย่างที่ไม่อยู่ในเอกสาร = **ปฏิเสธ** (default deny) รวมถึง path ที่ไม่มีกติกา',
    `- **การเขียนจาก client** (${WRITES.join(' / ')}) ปฏิเสธทุก collection ทุก role — ทุกการเปลี่ยนแปลงผ่าน API ซึ่งตรวจสิทธิ์ด้วยกติกา domain ชุดเดียวกัน (Admin SDK ข้าม Rules)`,
    `- **อ่าน**: ${code('get')} = เปิด document หนึ่งรายการ, ${code('list')} = query ทั้ง collection โดยไม่กรอง (Rules ไม่กรองผลให้)`,
    `- บัญชีต้อง login ด้วย Google อีเมล @tdfb.co ที่ verified และ ${code('access/{uid}.enabled')} = true; role อ่านจาก ${code('access/{uid}')} ไม่ใช่ custom claim`,
    `- ขนาด matrix: ${SUBJECT_KEYS.length} role × ${RESOURCES.length} collection/path × ${ACL_OPERATIONS.length} operation = ${cells.length} ช่อง อนุญาต ${allowedCount} ช่อง ที่เหลือปฏิเสธ`,
    '',
    '## สิทธิ์พื้นฐาน: ทุกบัญชีที่ใช้งานได้',
    '',
    `บัญชีที่ใช้งานได้ (active) = ${ACTIVE_SUBJECTS.map(code).join(', ')} ทุกคนได้สิทธิ์ชุดนี้เหมือนกัน`,
    '',
    ...table(baseline),
    '',
    '## ตาม role',
    '',
    ...SUBJECT_KEYS.flatMap((key) => roleSection(key, baseline)),
    ...confidentialSection(),
    ...watcherSection(),
  ];
  return `${lines.join('\n').trimEnd()}\n`;
}
