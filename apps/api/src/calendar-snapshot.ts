// Server-side persistence shape for calendar snapshots (D-S01-1, D-S03-4). Hashing and the
// source reference are computed here when data is saved, so @gm/time stays pure.
import { createHash } from 'node:crypto';
import { canonicalCalendarSnapshotJson, type CalendarSnapshotDocument } from '@gm/contracts';
import { snapshotCalendar, type CalendarSnapshot } from '@gm/time';

export interface SnapshotProvenance {
  /** ID of the live calendar the snapshot was copied from, e.g. the company or a site calendar. */
  readonly sourceCalendarId: string;
  /** When the snapshot was taken (UTC epoch ms), supplied by the command that saves it. */
  readonly snapshotAt: number;
}

function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Validates and normalises a live calendar with @gm/time (Asia/Bangkok only, holiday years
 * 2000–2100) and returns the document to persist. `source` = `<calendar id>@<ISO-8601 UTC>`.
 */
export function toCalendarSnapshotDocument(
  live: CalendarSnapshot,
  { sourceCalendarId, snapshotAt }: SnapshotProvenance,
): CalendarSnapshotDocument {
  if (!/^[^\s@]+$/.test(sourceCalendarId)) {
    throw new RangeError('sourceCalendarId must be a non-empty id without spaces or "@"');
  }
  if (!Number.isSafeInteger(snapshotAt)) throw new RangeError('snapshotAt must be an integer epoch-millisecond instant');

  const snapshot = snapshotCalendar(live);
  const content = {
    timezone: 'Asia/Bangkok' as const,
    open_weekdays: snapshot.openWeekdays,
    holidays: snapshot.holidays,
  };
  return {
    ...content,
    hash: sha256Hex(canonicalCalendarSnapshotJson(content)),
    source: `${sourceCalendarId}@${new Date(snapshotAt).toISOString()}`,
  };
}

/** Converts a stored document back to the @gm/time input, refusing content that no longer matches its hash. */
export function fromCalendarSnapshotDocument(document: CalendarSnapshotDocument): CalendarSnapshot {
  if (sha256Hex(canonicalCalendarSnapshotJson(document)) !== document.hash) {
    throw new RangeError('calendar snapshot content does not match its hash');
  }
  return snapshotCalendar({
    timeZone: document.timezone,
    openWeekdays: document.open_weekdays,
    holidays: document.holidays,
  });
}
