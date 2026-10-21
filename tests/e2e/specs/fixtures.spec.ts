// S00 — the seeding path keeps Thai fixture data exactly. Each document is written to its own copy
// (`roundtrip_<collection>`) and read back, so the check does not depend on what other specs do to
// the seeded documents through the app (A11: the calendar test adds and removes a holiday via the API).
import { expect, test } from '@playwright/test';
import { emulatorTarget, loadFixtures, readDocument, writeDocument } from '../support/emulator';

test('seeded Thai fixtures round-trip through the Firestore emulator unchanged', async () => {
  const target = emulatorTarget();
  for (const [collection, documents] of Object.entries(loadFixtures().collections)) {
    for (const [id, data] of Object.entries(documents)) {
      await writeDocument(target, `roundtrip_${collection}`, id, data);
      expect(await readDocument(target, `roundtrip_${collection}`, id)).toEqual(data);
    }
  }
});
