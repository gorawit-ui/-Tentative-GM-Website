// Determinism settings for `npm run test:unit` (BUILD-COMMANDS: deterministic fake clock,
// no Firebase/network).
//
// The machine time zone is forced to one that is neither Asia/Bangkok nor UTC and has DST,
// so code that accidentally relies on the local time zone fails on every machine instead of
// passing only on Thai laptops. Business time is always computed explicitly in Asia/Bangkok
// by @gm/time (Part 6 §6.7).
export const UNIT_TEST_TIME_ZONE = 'America/New_York';

// Default "now" for unit tests: Fri 2 Oct 2026 16:00 Asia/Bangkok (TEST-CHECKLIST §1 first case).
// Pure functions must not read it — they take `now` as an argument. It only makes any
// remaining wall-clock read reproducible.
export const UNIT_TEST_FIXED_NOW = '2026-10-02T09:00:00.000Z';
