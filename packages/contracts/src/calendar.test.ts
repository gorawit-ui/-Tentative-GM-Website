import { expectTypeOf, it } from 'vitest';
import type { CalendarSnapshotDocument, SlaDurationUnit } from './index';

it('the persisted snapshot has the exact snake_case/provenance fields (D-S01-1)', () => {
  expectTypeOf<keyof CalendarSnapshotDocument>().toEqualTypeOf<'timezone' | 'open_weekdays' | 'holidays' | 'hash' | 'source'>();
  expectTypeOf<CalendarSnapshotDocument['timezone']>().toEqualTypeOf<'Asia/Bangkok'>();
  expectTypeOf<CalendarSnapshotDocument['open_weekdays']>().toEqualTypeOf<readonly (1 | 2 | 3 | 4 | 5 | 6 | 7)[]>();
  expectTypeOf<SlaDurationUnit>().toEqualTypeOf<'business_days' | 'continuous_24h'>();
});
