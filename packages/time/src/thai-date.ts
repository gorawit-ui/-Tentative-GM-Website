// A07 — the date and time people read (Part 3 §1: Thai, Buddhist-era year, Asia/Bangkok, an explicit
// time for important events such as the auto-close). One pure formatter for messages and screens, so a
// notice says the same date as the page it links to: `6 ม.ค. 2570 16:00 น.`
import type { Instant } from './calendar';
import { zonedFormatter } from './zoned-date';

const BANGKOK = zonedFormatter('Asia/Bangkok');
const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'] as const;
const BUDDHIST_ERA_OFFSET = 543;

export function formatThaiDateTime(instant: Instant): string {
  if (!Number.isSafeInteger(instant)) throw new RangeError('instant must be an integer epoch-millisecond instant');
  const fields: Record<string, string> = {};
  for (const part of BANGKOK.formatToParts(instant)) if (part.type !== 'literal') fields[part.type] = part.value;
  const month = THAI_MONTHS[Number(fields.month) - 1];
  return `${Number(fields.day)} ${month} ${Number(fields.year) + BUDDHIST_ERA_OFFSET} ${fields.hour}:${fields.minute} น.`;
}
