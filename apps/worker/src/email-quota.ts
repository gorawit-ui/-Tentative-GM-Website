// A08 — the app's own e-mail cap (Part 6 §6.10: start at 30 per minute and 500 per day, under the
// mailbox's own daily limit). One server-only counter document (`system_counters/email_send`, ACL:
// nobody reads it from a client) holds this minute's and this Bangkok day's count, updated in one
// transaction before each send. Over the cap → the message stays in the outbox and is tried again
// when the cap opens (next minute / 00:00 Bangkok); it is never dropped (§6.10 “ชนเพดานค้าง outbox”).
import { MINUTE_MS, bangkokDateOf, startOfNextBangkokDay, type Instant } from '@gm/time';
import type { WorkerStore } from './store';

export const EMAIL_SEND_COUNTER_PATH = 'system_counters/email_send';
export const EMAIL_CAP = { perMinute: 30, perDay: 500 } as const;

export type QuotaDecision = { readonly ok: true } | { readonly ok: false; readonly retryAt: Instant };

export interface EmailQuota {
  /** Takes one slot now, or says when the next one opens. */
  reserve(): Promise<QuotaDecision>;
}

const count = (value: unknown): number => (Number.isSafeInteger(value) && (value as number) > 0 ? (value as number) : 0);

export function firestoreEmailQuota(store: WorkerStore, now: () => Instant, limits: { readonly perMinute: number; readonly perDay: number } = EMAIL_CAP): EmailQuota {
  return {
    reserve: () =>
      store.runTransaction(async (transaction): Promise<QuotaDecision> => {
        const at = now();
        const day = bangkokDateOf(at);
        const minute = Math.floor(at / MINUTE_MS);
        const counter = await transaction.get(EMAIL_SEND_COUNTER_PATH);
        const dayCount = counter?.day === day ? count(counter.day_count) : 0;
        const minuteCount = counter?.minute === minute ? count(counter.minute_count) : 0;
        if (dayCount >= limits.perDay) return { ok: false, retryAt: startOfNextBangkokDay(at) };
        if (minuteCount >= limits.perMinute) return { ok: false, retryAt: (minute + 1) * MINUTE_MS };
        transaction.set(EMAIL_SEND_COUNTER_PATH, { day, day_count: dayCount + 1, minute, minute_count: minuteCount + 1, updated_at: at });
        return { ok: true };
      }),
  };
}
