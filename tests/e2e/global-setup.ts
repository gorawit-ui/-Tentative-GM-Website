// Seeds the Firestore emulator with the synthetic Thai fixtures before any E2E test runs.
import { clearFirestore, emulatorTarget, loadFixtures, writeDocument } from './support/emulator';

export default async function globalSetup(): Promise<void> {
  const target = emulatorTarget();
  await clearFirestore(target);
  for (const [collection, documents] of Object.entries(loadFixtures().collections)) {
    for (const [id, data] of Object.entries(documents)) {
      await writeDocument(target, collection, id, data);
    }
  }
}
