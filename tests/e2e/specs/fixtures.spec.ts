import { expect, test } from '@playwright/test';
import { emulatorTarget, loadFixtures, readDocument } from '../support/emulator';

test('seeded Thai fixtures round-trip through the Firestore emulator unchanged', async () => {
  const target = emulatorTarget();
  for (const [collection, documents] of Object.entries(loadFixtures().collections)) {
    for (const [id, data] of Object.entries(documents)) {
      expect(await readDocument(target, collection, id)).toEqual(data);
    }
  }
});
