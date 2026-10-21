// Seeds the emulators with the synthetic Thai fixtures before any E2E test runs: Firestore documents
// (incl. A09 access/{uid} and the pre-login contact) and the A09 Google accounts of the Auth emulator.
import { clearAuthUsers, clearFirestore, createAuthUsers, emulatorTarget, fixtureAuthUsers, loadFixtures, writeDocument } from './support/emulator';

export default async function globalSetup(): Promise<void> {
  const target = emulatorTarget();
  await clearFirestore(target);
  for (const [collection, documents] of Object.entries(loadFixtures().collections)) {
    for (const [id, data] of Object.entries(documents)) {
      await writeDocument(target, collection, id, data);
    }
  }
  await clearAuthUsers(target);
  await createAuthUsers(target, fixtureAuthUsers());
}
