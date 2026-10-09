// A05 — the `presence_reset` job (C7, S07, Part 6 §6.9): one job per Bangkok day (D-A05-5), started
// by the first tick of the day, that resets each GM's expired presence to “ไม่ระบุ” with the S07 rule on the latest profile — leave
// with an end date stays until the end of that day, and a value set for the new day before a late
// tick is kept. The pinned request is untouched. The UI already shows the effective presence from
// the expiry, so the reset only keeps the stored value from going stale. Reads the GM list and their
// profiles once a day (a handful of documents).
import { gmProfileOf } from '@gm/api/directories';
import { isPersonId } from '@gm/contracts';
import { resetPresence } from '@gm/domain';
import type { JobHandler } from '../scheduled-work';

/**
 * D-A05-5: one job document per Bangkok date (`presence_reset-YYYY-MM-DD`), so a day whose job failed
 * for good does not stop the next day; the failed one stays for the Admin to see (FU-25).
 */
export function presenceResetJobId(bangkokDate: string): string {
  return `presence_reset-${bangkokDate}`;
}

const strings = (value: unknown): readonly string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);

export function presenceResetJob(): JobHandler {
  return async (context) => {
    await context.runChecked(async (transaction) => {
      const routing = await transaction.get('settings/routing');
      const profiles = [];
      for (const personId of new Set(strings(routing?.gm_person_ids).filter(isPersonId))) {
        const stored = await transaction.get(`gm_profiles/${personId}`);
        if (stored !== undefined) profiles.push({ personId, stored });
      }
      for (const { personId, stored } of profiles) {
        const profile = gmProfileOf(personId, stored);
        if (profile === undefined || !resetPresence(profile, context.now).applied) continue;
        const { presence_updated_at: _setAt, leave_ends_on: _leaveEnds, ...rest } = stored;
        transaction.set(`gm_profiles/${personId}`, { ...rest, presence_status: { kind: 'unspecified' } });
      }
    });
    // The next day has its own job (D-A05-5).
    return { kind: 'done' };
  };
}
