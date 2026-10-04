import { BUSINESS_DAY_MS } from './calendar';
import { STALE_AFTER_MS } from './lifecycle-clocks';

/** Where a business duration is shown (Part 6 §6.7, F4, U4, P7-UX-01). */
export type DurationTextContext = 'waiting' | 'last_update' | 'gm_stale';

/**
 * Thai display text for a raw business duration. Shown values are whole business days rounded
 * down (F4); below 1 business day the text says "ไม่ถึง 1 วันทำการ", never "0 วันทำการ"
 * (P7-UX-01). Decisions such as stale must use the raw value, not this text.
 */
export function formatBusinessDuration(rawDuration: number, context: DurationTextContext): string {
  if (!Number.isFinite(rawDuration) || rawDuration < 0) {
    throw new RangeError('rawDuration must be a finite, non-negative number of milliseconds');
  }
  const days = Math.floor(rawDuration / BUSINESS_DAY_MS);
  const amount = days < 1 ? 'ไม่ถึง 1 วันทำการ' : `${days} วันทำการ`;

  switch (context) {
    case 'waiting':
      return amount;
    case 'last_update':
      return days < 1 ? `อัปเดตล่าสุด${amount}ที่แล้ว` : `อัปเดตล่าสุด ${amount}ที่แล้ว`;
    case 'gm_stale':
      if (rawDuration <= STALE_AFTER_MS) {
        throw new RangeError('the GM stale label is only shown for more than 3 business days');
      }
      return `ไม่ขยับ ${amount} · ถึงเวลาติดตาม`;
    default:
      throw new RangeError(`unknown context ${JSON.stringify(context)}`);
  }
}
